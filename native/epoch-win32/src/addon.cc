#include <node_api.h>
#include <windows.h>
#include <bcrypt.h>
#include <winternl.h>

#include "product_identity.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cwctype>
#include <iomanip>
#include <sstream>
#include <set>
#include <string>
#include <vector>

namespace {

using NtCreateFileFn = NTSTATUS(NTAPI*)(
    PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES, PIO_STATUS_BLOCK, PLARGE_INTEGER,
    ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);
using NtSetInformationFileFn = NTSTATUS(NTAPI*)(
    HANDLE, PIO_STATUS_BLOCK, PVOID, ULONG, FILE_INFORMATION_CLASS);
using NtQueryInformationFileFn = NTSTATUS(NTAPI*)(
    HANDLE, PIO_STATUS_BLOCK, PVOID, ULONG, FILE_INFORMATION_CLASS);
using RtlNtStatusToDosErrorFn = ULONG(WINAPI*)(NTSTATUS);
constexpr FILE_INFORMATION_CLASS kFileRenameInformation =
    static_cast<FILE_INFORMATION_CLASS>(10);

struct Lease {
  HANDLE mutex = nullptr;
  std::vector<HANDLE> ancestry;
  HANDLE app_data = INVALID_HANDLE_VALUE;
  HANDLE product = INVALID_HANDLE_VALUE;
  HANDLE protected_workspace = INVALID_HANDLE_VALUE;
  HANDLE protected_epoch = INVALID_HANDLE_VALUE;
  HANDLE transition = INVALID_HANDLE_VALUE;
  HANDLE lock_file = INVALID_HANDLE_VALUE;
  bool released = false;
  std::string expected_manifest;
};

struct NativeFileIdentity {
  unsigned long long volume_serial = 0;
  std::array<unsigned char, 16> file_id{};
};

struct DeleteEntry {
  std::vector<std::wstring> segments;
  NativeFileIdentity identity;
  bool directory = false;
};

struct NativeDirectoryEntry {
  std::wstring name;
  LARGE_INTEGER file_id{};
  bool directory = false;
};

struct ProductDeleteTarget {
  std::wstring name;
  bool reject_epoch_2_child = false;
};

struct FileInternalInformationValue {
  LARGE_INTEGER index_number;
};

void CloseHandleIfValid(HANDLE& handle) {
  if (handle != nullptr && handle != INVALID_HANDLE_VALUE) {
    CloseHandle(handle);
    handle = INVALID_HANDLE_VALUE;
  }
}

void ReleaseLease(Lease* lease) {
  if (lease == nullptr || lease->released) return;
  CloseHandleIfValid(lease->lock_file);
  CloseHandleIfValid(lease->transition);
  CloseHandleIfValid(lease->protected_epoch);
  CloseHandleIfValid(lease->protected_workspace);
  CloseHandleIfValid(lease->product);
  for (auto iterator = lease->ancestry.rbegin(); iterator != lease->ancestry.rend(); ++iterator) {
    CloseHandleIfValid(*iterator);
  }
  lease->ancestry.clear();
  lease->app_data = INVALID_HANDLE_VALUE;
  if (lease->mutex != nullptr && lease->mutex != INVALID_HANDLE_VALUE) {
    ReleaseMutex(lease->mutex);
    CloseHandle(lease->mutex);
    lease->mutex = nullptr;
  }
  lease->released = true;
}

napi_value ThrowCode(napi_env env, const char* code) {
  napi_value message;
  napi_value error;
  napi_value code_value;
  napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &message);
  napi_create_error(env, nullptr, message, &error);
  napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &code_value);
  napi_set_named_property(env, error, "code", code_value);
  napi_throw(env, error);
  return nullptr;
}

napi_value ThrowWin32Code(napi_env env, const char* code, DWORD win32_error) {
  napi_value message;
  napi_value error;
  napi_value code_value;
  napi_value native_value;
  napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &message);
  napi_create_error(env, nullptr, message, &error);
  napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &code_value);
  napi_create_uint32(env, win32_error, &native_value);
  napi_set_named_property(env, error, "code", code_value);
  napi_set_named_property(env, error, "win32Error", native_value);
  napi_throw(env, error);
  return nullptr;
}

bool GetRequiredWideString(
    napi_env env, napi_value object, const char* name, std::wstring* output) {
  napi_value value;
  bool present = false;
  if (napi_has_named_property(env, object, name, &present) != napi_ok || !present ||
      napi_get_named_property(env, object, name, &value) != napi_ok) {
    ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
    return false;
  }
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string) {
    ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
    return false;
  }
  size_t length = 0;
  if (napi_get_value_string_utf16(env, value, nullptr, 0, &length) != napi_ok ||
      length == 0 || length > 32760) {
    ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
    return false;
  }
  std::vector<char16_t> buffer(length + 1);
  size_t copied = 0;
  if (napi_get_value_string_utf16(env, value, buffer.data(), buffer.size(), &copied) != napi_ok ||
      copied != length) {
    ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
    return false;
  }
  output->assign(reinterpret_cast<const wchar_t*>(buffer.data()), copied);
  return true;
}

std::wstring Lower(std::wstring value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](wchar_t ch) { return static_cast<wchar_t>(std::towlower(ch)); });
  return value;
}

bool IsReservedDosName(const std::wstring& segment) {
  const size_t dot = segment.find(L'.');
  const std::wstring base = Lower(segment.substr(0, dot));
  if (base == L"con" || base == L"prn" || base == L"aux" || base == L"nul") return true;
  if (base.size() == 4 && (base.rfind(L"com", 0) == 0 || base.rfind(L"lpt", 0) == 0) &&
      base[3] >= L'1' && base[3] <= L'9') return true;
  return false;
}

bool IsSafeSegment(const std::wstring& segment) {
  if (segment.empty() || segment == L"." || segment == L".." ||
      segment.back() == L'.' || segment.back() == L' ' || IsReservedDosName(segment)) {
    return false;
  }
  for (const wchar_t ch : segment) {
    if (ch < 32 || ch == L'\\' || ch == L'/' || ch == L':' || ch == L'*' ||
        ch == L'?' || ch == L'"' || ch == L'<' || ch == L'>' || ch == L'|') {
      return false;
    }
  }
  return true;
}

bool ParseLocalDrivePath(
    const std::wstring& input, wchar_t* drive_letter, std::vector<std::wstring>* segments) {
  if (input.size() < 3 || !std::iswalpha(input[0]) || input[1] != L':' ||
      (input[2] != L'\\' && input[2] != L'/')) return false;
  std::wstring normalized = input;
  std::replace(normalized.begin(), normalized.end(), L'/', L'\\');
  if (normalized.rfind(L"\\\\", 0) == 0 || normalized.rfind(L"\\?\\", 0) == 0 ||
      normalized.rfind(L"\\.\\", 0) == 0) return false;
  while (normalized.size() > 3 && normalized.back() == L'\\') normalized.pop_back();
  size_t start = 3;
  while (start < normalized.size()) {
    const size_t end = normalized.find(L'\\', start);
    const std::wstring segment = normalized.substr(start, end == std::wstring::npos
        ? std::wstring::npos : end - start);
    if (!IsSafeSegment(segment)) return false;
    segments->push_back(segment);
    if (end == std::wstring::npos) break;
    start = end + 1;
  }
  if (segments->empty()) return false;
  *drive_letter = static_cast<wchar_t>(std::towupper(input[0]));
  return true;
}

bool IsReparsePoint(HANDLE handle) {
  FILE_ATTRIBUTE_TAG_INFO info{};
  if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &info, sizeof(info))) return true;
  return (info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
}

NtCreateFileFn ResolveNtCreateFile() {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (ntdll == nullptr) return nullptr;
  return reinterpret_cast<NtCreateFileFn>(GetProcAddress(ntdll, "NtCreateFile"));
}

NtSetInformationFileFn ResolveNtSetInformationFile() {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (ntdll == nullptr) return nullptr;
  return reinterpret_cast<NtSetInformationFileFn>(
      GetProcAddress(ntdll, "NtSetInformationFile"));
}

NtQueryInformationFileFn ResolveNtQueryInformationFile() {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (ntdll == nullptr) return nullptr;
  return reinterpret_cast<NtQueryInformationFileFn>(
      GetProcAddress(ntdll, "NtQueryInformationFile"));
}

DWORD NtStatusToWin32(NTSTATUS status) {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (ntdll == nullptr) return ERROR_GEN_FAILURE;
  auto convert = reinterpret_cast<RtlNtStatusToDosErrorFn>(
      GetProcAddress(ntdll, "RtlNtStatusToDosError"));
  return convert == nullptr ? ERROR_GEN_FAILURE : convert(status);
}

HANDLE OpenRelative(
    NtCreateFileFn nt_create_file, HANDLE parent, const std::wstring& name,
    bool directory, ULONG disposition, ACCESS_MASK access, ULONG share_access) {
  UNICODE_STRING unicode_name{};
  unicode_name.Buffer = const_cast<PWSTR>(name.data());
  unicode_name.Length = static_cast<USHORT>(name.size() * sizeof(wchar_t));
  unicode_name.MaximumLength = unicode_name.Length;
  OBJECT_ATTRIBUTES attributes{};
  InitializeObjectAttributes(&attributes, &unicode_name, OBJ_CASE_INSENSITIVE, parent, nullptr);
  IO_STATUS_BLOCK io_status{};
  HANDLE result = INVALID_HANDLE_VALUE;
  const ULONG options = FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT |
      (directory ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE);
  const NTSTATUS status = nt_create_file(
      &result, access, &attributes, &io_status, nullptr,
      directory ? FILE_ATTRIBUTE_DIRECTORY : FILE_ATTRIBUTE_HIDDEN,
      share_access, disposition, options, nullptr, 0);
  if (status < 0) {
    SetLastError(NtStatusToWin32(status));
    return INVALID_HANDLE_VALUE;
  }
  return result;
}

HANDLE OpenRelativeAny(
    NtCreateFileFn nt_create_file, HANDLE parent, const std::wstring& name,
    ACCESS_MASK access, ULONG share_access) {
  UNICODE_STRING unicode_name{};
  unicode_name.Buffer = const_cast<PWSTR>(name.data());
  unicode_name.Length = static_cast<USHORT>(name.size() * sizeof(wchar_t));
  unicode_name.MaximumLength = unicode_name.Length;
  OBJECT_ATTRIBUTES attributes{};
  InitializeObjectAttributes(&attributes, &unicode_name, OBJ_CASE_INSENSITIVE, parent, nullptr);
  IO_STATUS_BLOCK io_status{};
  HANDLE result = INVALID_HANDLE_VALUE;
  const NTSTATUS status = nt_create_file(
      &result, access, &attributes, &io_status, nullptr, FILE_ATTRIBUTE_NORMAL,
      share_access, FILE_OPEN,
      FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT,
      nullptr, 0);
  if (status < 0) {
    SetLastError(NtStatusToWin32(status));
    return INVALID_HANDLE_VALUE;
  }
  return result;
}

bool GetNativeFileIdentity(HANDLE handle, NativeFileIdentity* output) {
  FILE_ID_INFO info{};
  if (!GetFileInformationByHandleEx(handle, FileIdInfo, &info, sizeof(info))) return false;
  output->volume_serial = info.VolumeSerialNumber;
  std::copy(std::begin(info.FileId.Identifier), std::end(info.FileId.Identifier),
            output->file_id.begin());
  return true;
}

bool SameNativeFileIdentity(
    const NativeFileIdentity& left, const NativeFileIdentity& right) {
  return left.volume_serial == right.volume_serial && left.file_id == right.file_id;
}

bool IsDirectoryHandle(HANDLE handle, bool* directory) {
  FILE_STANDARD_INFO info{};
  if (!GetFileInformationByHandleEx(handle, FileStandardInfo, &info, sizeof(info))) return false;
  *directory = info.Directory != FALSE;
  return true;
}

bool GetInternalFileId(
    NtQueryInformationFileFn nt_query_information_file, HANDLE handle,
    LARGE_INTEGER* output) {
  IO_STATUS_BLOCK io_status{};
  FileInternalInformationValue info{};
  constexpr FILE_INFORMATION_CLASS kFileInternalInformation =
      static_cast<FILE_INFORMATION_CLASS>(6);
  const NTSTATUS status = nt_query_information_file(
      handle, &io_status, &info, sizeof(info), kFileInternalInformation);
  if (status < 0) {
    SetLastError(NtStatusToWin32(status));
    return false;
  }
  *output = info.index_number;
  return true;
}

HANDLE OpenDriveRoot(wchar_t drive_letter) {
  std::wstring path = L"\\\\?\\C:\\";
  path[4] = drive_letter;
  return CreateFileW(
      path.c_str(), FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
      FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
}

const ACCESS_MASK kReadDirectoryAccess =
    FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE;
const ACCESS_MASK kMutableDirectoryAccess =
    kReadDirectoryAccess | FILE_ADD_SUBDIRECTORY | FILE_ADD_FILE | FILE_WRITE_ATTRIBUTES;

HANDLE OpenAppDataRoot(
    NtCreateFileFn nt_create_file, const std::wstring& path,
    std::vector<HANDLE>* ancestry, const char** error_code) {
  wchar_t drive = 0;
  std::vector<std::wstring> segments;
  if (!ParseLocalDrivePath(path, &drive, &segments)) {
    *error_code = "EPOCH2_WIN32_APP_DATA_PATH_UNSAFE";
    return INVALID_HANDLE_VALUE;
  }
  HANDLE current = OpenDriveRoot(drive);
  if (current == INVALID_HANDLE_VALUE || IsReparsePoint(current)) {
    CloseHandleIfValid(current);
    *error_code = "EPOCH2_WIN32_ROOT_OPEN_FAILED";
    return INVALID_HANDLE_VALUE;
  }
  ancestry->push_back(current);
  for (size_t index = 0; index < segments.size(); ++index) {
    const bool final_segment = index + 1 == segments.size();
    HANDLE child = OpenRelative(
        nt_create_file, current, segments[index], true, FILE_OPEN,
        final_segment ? kMutableDirectoryAccess : kReadDirectoryAccess,
        FILE_SHARE_READ | FILE_SHARE_WRITE);
    current = child;
    if (current == INVALID_HANDLE_VALUE || IsReparsePoint(current)) {
      CloseHandleIfValid(current);
      for (auto iterator = ancestry->rbegin(); iterator != ancestry->rend(); ++iterator) {
        CloseHandleIfValid(*iterator);
      }
      ancestry->clear();
      *error_code = "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED";
      return INVALID_HANDLE_VALUE;
    }
    ancestry->push_back(current);
  }
  return current;
}

bool IsSafeMutexName(const std::wstring& value) {
  const std::wstring prefix = L"Local\\Starverse.Epoch2.";
  if (value.rfind(prefix, 0) != 0 || value.size() != prefix.size() + 64) return false;
  return std::all_of(value.begin() + static_cast<std::ptrdiff_t>(prefix.size()), value.end(),
                     [](wchar_t ch) { return (ch >= L'0' && ch <= L'9') || (ch >= L'a' && ch <= L'f'); });
}

std::string BytesToHex(const unsigned char* bytes, size_t length) {
  std::ostringstream stream;
  stream << std::hex << std::setfill('0');
  for (size_t index = 0; index < length; ++index) {
    stream << std::setw(2) << static_cast<unsigned int>(bytes[index]);
  }
  return stream.str();
}

bool Sha256Hex(const std::string& input, std::string* output) {
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  DWORD object_length = 0;
  DWORD hash_length = 0;
  DWORD copied = 0;
  std::vector<unsigned char> hash_object;
  std::vector<unsigned char> digest;
  bool success = false;
  if (BCryptOpenAlgorithmProvider(
          &algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) != 0 ||
      BCryptGetProperty(
          algorithm, BCRYPT_OBJECT_LENGTH,
          reinterpret_cast<PUCHAR>(&object_length), sizeof(object_length), &copied, 0) != 0 ||
      BCryptGetProperty(
          algorithm, BCRYPT_HASH_LENGTH,
          reinterpret_cast<PUCHAR>(&hash_length), sizeof(hash_length), &copied, 0) != 0 ||
      hash_length != 32) {
    if (algorithm != nullptr) BCryptCloseAlgorithmProvider(algorithm, 0);
    return false;
  }
  hash_object.resize(object_length);
  digest.resize(hash_length);
  if (BCryptCreateHash(
          algorithm, &hash, hash_object.data(), object_length,
          nullptr, 0, 0) == 0 &&
      BCryptHashData(
          hash, reinterpret_cast<PUCHAR>(const_cast<char*>(input.data())),
          static_cast<ULONG>(input.size()), 0) == 0 &&
      BCryptFinishHash(hash, digest.data(), hash_length, 0) == 0) {
    *output = BytesToHex(digest.data(), digest.size());
    success = true;
  }
  if (hash != nullptr) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(algorithm, 0);
  return success;
}

bool CanonicalPathUtf8(const std::wstring& input, std::string* output) {
  std::wstring normalized_input = input;
  std::replace(normalized_input.begin(), normalized_input.end(), L'/', L'\\');
  while (normalized_input.size() > 3 && normalized_input.back() == L'\\') {
    normalized_input.pop_back();
  }
  std::wstring normalized(normalized_input.size() * 3 + 1, L'\0');
  const int normalized_length = NormalizeString(
          NormalizationC, normalized_input.data(),
          static_cast<int>(normalized_input.size()), normalized.data(),
          static_cast<int>(normalized.size()));
  if (normalized_length <= 0) return false;
  normalized.resize(static_cast<size_t>(normalized_length));
  std::wstring lowered(normalized.size() + 1, L'\0');
  const int lower_length = LCMapStringEx(
          LOCALE_NAME_INVARIANT, LCMAP_LOWERCASE,
          normalized.data(), static_cast<int>(normalized.size()),
          lowered.data(), static_cast<int>(lowered.size()), nullptr, nullptr, 0);
  if (lower_length <= 0) return false;
  lowered.resize(static_cast<size_t>(lower_length));
  const int utf8_length = WideCharToMultiByte(
      CP_UTF8, WC_ERR_INVALID_CHARS, lowered.data(),
      static_cast<int>(lowered.size()), nullptr, 0, nullptr, nullptr);
  if (utf8_length <= 0) return false;
  output->resize(static_cast<size_t>(utf8_length));
  return WideCharToMultiByte(
      CP_UTF8, WC_ERR_INVALID_CHARS, lowered.data(),
      static_cast<int>(lowered.size()), output->data(), utf8_length,
      nullptr, nullptr) == utf8_length;
}

bool BuildExpectedRootManifest(
    const std::wstring& app_data_root, std::string* output) {
  std::wstring epoch_root = app_data_root;
  while (epoch_root.size() > 3 &&
         (epoch_root.back() == L'\\' || epoch_root.back() == L'/')) {
    epoch_root.pop_back();
  }
  epoch_root += L"\\" STARVERSE_PRODUCT_NAME_W L"\\workspace\\epoch-2";
  std::string canonical_epoch_root;
  if (!CanonicalPathUtf8(epoch_root, &canonical_epoch_root)) return false;
  std::string root_input = "starverse";
  root_input.push_back('\0');
  root_input += STARVERSE_PACKAGED_APP_ID_UTF8;
  root_input.push_back('\0');
  root_input += canonical_epoch_root;
  std::string root_id;
  if (!Sha256Hex(root_input, &root_id)) return false;
  *output = "{\n"
      "  \"schemaVersion\": 1,\n"
      "  \"dataEpoch\": 2,\n"
      "  \"applicationId\": \"" STARVERSE_PACKAGED_APP_ID_UTF8 "\",\n"
      "  \"productDirectory\": \"" STARVERSE_PRODUCT_NAME_UTF8 "\",\n"
      "  \"rootId\": \"" + root_id + "\"\n"
      "}\n";
  return true;
}

bool GetWideStringValue(napi_env env, napi_value value, std::wstring* output) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string) return false;
  size_t length = 0;
  if (napi_get_value_string_utf16(env, value, nullptr, 0, &length) != napi_ok ||
      length == 0 || length > 255) return false;
  std::vector<char16_t> buffer(length + 1);
  size_t copied = 0;
  if (napi_get_value_string_utf16(env, value, buffer.data(), buffer.size(), &copied) != napi_ok ||
      copied != length) return false;
  output->assign(reinterpret_cast<const wchar_t*>(buffer.data()), copied);
  return true;
}

bool IsAllowedTransitionDataFile(const std::wstring& name) {
  return name == L"root-manifest.json" || name == L"epoch-transition.journal.json";
}

uint32_t TransitionFileMaxBytes(const std::wstring& name) {
  if (name == L"root-manifest.json") return 4 * 1024;
  if (name == L"epoch-transition.journal.json") return 64 * 1024;
  return 0;
}

Lease* GetLeaseCall(
    napi_env env, napi_callback_info info, size_t expected_argc, napi_value* args) {
  napi_value this_arg;
  void* data = nullptr;
  size_t argc = expected_argc;
  if (napi_get_cb_info(env, info, &argc, args, &this_arg, nullptr) != napi_ok ||
      argc != expected_argc || napi_unwrap(env, this_arg, &data) != napi_ok || data == nullptr) {
    ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
    return nullptr;
  }
  auto* lease = static_cast<Lease*>(data);
  if (lease->released) {
    ThrowCode(env, "EPOCH2_WIN32_LEASE_RELEASED");
    return nullptr;
  }
  return lease;
}

napi_value LeaseReadTransitionFile(napi_env env, napi_callback_info info) {
  napi_value args[2];
  Lease* lease = GetLeaseCall(env, info, 2, args);
  if (lease == nullptr) return nullptr;
  std::wstring name;
  uint32_t max_bytes = 0;
  if (!GetWideStringValue(env, args[0], &name) || !IsSafeSegment(name) ||
      !IsAllowedTransitionDataFile(name) ||
      napi_get_value_uint32(env, args[1], &max_bytes) != napi_ok ||
      max_bytes != TransitionFileMaxBytes(name)) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  NtCreateFileFn nt_create_file = ResolveNtCreateFile();
  if (nt_create_file == nullptr) return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");
  HANDLE file = OpenRelative(
      nt_create_file, lease->transition, name, false, FILE_OPEN,
      GENERIC_READ | FILE_READ_ATTRIBUTES | SYNCHRONIZE, FILE_SHARE_READ);
  if (file == INVALID_HANDLE_VALUE) {
    const DWORD error = GetLastError();
    if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND) {
      napi_value null_value;
      napi_get_null(env, &null_value);
      return null_value;
    }
    return ThrowCode(env, "EPOCH2_WIN32_TRANSITION_READ_FAILED");
  }
  if (IsReparsePoint(file)) {
    CloseHandleIfValid(file);
    return ThrowCode(env, "EPOCH2_WIN32_TRANSITION_REPARSE_POINT");
  }
  LARGE_INTEGER size{};
  if (!GetFileSizeEx(file, &size) || size.QuadPart < 0 ||
      static_cast<unsigned long long>(size.QuadPart) > max_bytes) {
    CloseHandleIfValid(file);
    return ThrowCode(env, "EPOCH2_WIN32_TRANSITION_FILE_TOO_LARGE");
  }
  std::vector<unsigned char> bytes(static_cast<size_t>(size.QuadPart));
  size_t offset = 0;
  while (offset < bytes.size()) {
    DWORD read = 0;
    const DWORD requested = static_cast<DWORD>(bytes.size() - offset);
    if (!ReadFile(file, bytes.data() + offset, requested, &read, nullptr) || read == 0) {
      CloseHandleIfValid(file);
      return ThrowCode(env, "EPOCH2_WIN32_TRANSITION_READ_FAILED");
    }
    offset += read;
  }
  CloseHandleIfValid(file);
  napi_value result;
  if (napi_create_buffer_copy(
          env, bytes.size(), bytes.empty() ? nullptr : bytes.data(), nullptr, &result) != napi_ok) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_CONTRACT_INVALID");
  }
  return result;
}

std::wstring RandomTemporaryName() {
  unsigned char random_bytes[16]{};
  if (BCryptGenRandom(
          nullptr, random_bytes, sizeof(random_bytes), BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) {
    return L"";
  }
  const std::string hex = BytesToHex(random_bytes, sizeof(random_bytes));
  return L".svtmp-" + std::wstring(hex.begin(), hex.end());
}

void DiscardTemporaryFile(HANDLE& file) {
  if (file == nullptr || file == INVALID_HANDLE_VALUE) return;
  FILE_DISPOSITION_INFO_EX disposition{};
  disposition.Flags = FILE_DISPOSITION_FLAG_DELETE |
      FILE_DISPOSITION_FLAG_POSIX_SEMANTICS |
      FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE;
  SetFileInformationByHandle(
      file, FileDispositionInfoEx, &disposition, sizeof(disposition));
  CloseHandleIfValid(file);
}

napi_value LeaseWriteTransitionFile(napi_env env, napi_callback_info info) {
  napi_value args[3];
  Lease* lease = GetLeaseCall(env, info, 3, args);
  if (lease == nullptr) return nullptr;
  std::wstring target_name;
  bool is_buffer = false;
  bool replace_existing = false;
  void* byte_data = nullptr;
  size_t byte_length = 0;
  if (!GetWideStringValue(env, args[0], &target_name) || !IsSafeSegment(target_name) ||
      !IsAllowedTransitionDataFile(target_name) ||
      napi_is_buffer(env, args[1], &is_buffer) != napi_ok || !is_buffer ||
      napi_get_buffer_info(env, args[1], &byte_data, &byte_length) != napi_ok ||
      napi_get_value_bool(env, args[2], &replace_existing) != napi_ok ||
      replace_existing != (target_name == L"epoch-transition.journal.json") ||
      byte_length == 0 || byte_length > TransitionFileMaxBytes(target_name)) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  NtCreateFileFn nt_create_file = ResolveNtCreateFile();
  if (nt_create_file == nullptr) return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");
  HANDLE temporary = INVALID_HANDLE_VALUE;
  for (size_t attempt = 0; attempt < 16 && temporary == INVALID_HANDLE_VALUE; ++attempt) {
    const std::wstring temporary_name = RandomTemporaryName();
    if (temporary_name.empty()) return ThrowCode(env, "EPOCH2_WIN32_RANDOM_FAILED");
    temporary = OpenRelative(
        nt_create_file, lease->transition, temporary_name, false, FILE_CREATE,
        GENERIC_READ | GENERIC_WRITE | DELETE | FILE_READ_ATTRIBUTES | SYNCHRONIZE, 0);
    if (temporary == INVALID_HANDLE_VALUE && GetLastError() != ERROR_FILE_EXISTS &&
        GetLastError() != ERROR_ALREADY_EXISTS) {
      return ThrowCode(env, "EPOCH2_WIN32_ATOMIC_REPLACE_FAILED");
    }
  }
  if (temporary == INVALID_HANDLE_VALUE) return ThrowCode(env, "EPOCH2_WIN32_RANDOM_COLLISION");
  if (IsReparsePoint(temporary)) {
    DiscardTemporaryFile(temporary);
    return ThrowCode(env, "EPOCH2_WIN32_TRANSITION_REPARSE_POINT");
  }
  size_t offset = 0;
  const auto* bytes = static_cast<const unsigned char*>(byte_data);
  while (offset < byte_length) {
    DWORD written = 0;
    const DWORD requested = static_cast<DWORD>(byte_length - offset);
    if (!WriteFile(temporary, bytes + offset, requested, &written, nullptr) || written == 0) {
      DiscardTemporaryFile(temporary);
      return ThrowCode(env, "EPOCH2_WIN32_TRANSITION_WRITE_FAILED");
    }
    offset += written;
  }
  if (!FlushFileBuffers(temporary)) {
    DiscardTemporaryFile(temporary);
    return ThrowCode(env, "EPOCH2_WIN32_TRANSITION_FLUSH_FAILED");
  }
  struct NativeRenameInformation {
    BOOLEAN ReplaceIfExists;
    HANDLE RootDirectory;
    ULONG FileNameLength;
    WCHAR FileName[1];
  };
  NtSetInformationFileFn nt_set_information_file = ResolveNtSetInformationFile();
  if (nt_set_information_file == nullptr) {
    DiscardTemporaryFile(temporary);
    return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");
  }
  const size_t name_bytes = target_name.size() * sizeof(wchar_t);
  std::vector<unsigned char> rename_buffer(
      offsetof(NativeRenameInformation, FileName) + name_bytes);
  auto* rename = reinterpret_cast<NativeRenameInformation*>(rename_buffer.data());
  rename->ReplaceIfExists = replace_existing ? TRUE : FALSE;
  rename->RootDirectory = lease->transition;
  rename->FileNameLength = static_cast<DWORD>(name_bytes);
  std::copy(target_name.begin(), target_name.end(), rename->FileName);
  IO_STATUS_BLOCK rename_status{};
  const NTSTATUS status = nt_set_information_file(
      temporary, &rename_status, rename, static_cast<ULONG>(rename_buffer.size()),
      kFileRenameInformation);
  if (status < 0) {
    const DWORD error = NtStatusToWin32(status);
    DiscardTemporaryFile(temporary);
    if (!replace_existing && (error == ERROR_ALREADY_EXISTS || error == ERROR_FILE_EXISTS)) {
      napi_value exists;
      napi_get_boolean(env, false, &exists);
      return exists;
    }
    return ThrowWin32Code(env, "EPOCH2_WIN32_TRANSITION_RENAME_FAILED", error);
  }
  CloseHandleIfValid(temporary);
  napi_value written;
  napi_get_boolean(env, true, &written);
  return written;
}

bool ResolveProductDeleteTarget(
    napi_env env, napi_value value, ProductDeleteTarget* output) {
  std::wstring target_id;
  if (!GetWideStringValue(env, value, &target_id)) return false;
  if (target_id == L"legacy_chat_db") output->name = L"chat.db";
  else if (target_id == L"legacy_chat_db_wal") output->name = L"chat.db-wal";
  else if (target_id == L"legacy_chat_db_shm") output->name = L"chat.db-shm";
  else if (target_id == L"legacy_chat_db_journal") output->name = L"chat.db-journal";
  else if (target_id == L"legacy_assets") output->name = L"assets";
  else if (target_id == L"legacy_engine_plugins") output->name = L"engine-plugins";
  else if (target_id == L"legacy_managed_runtimes") output->name = L"managed-runtimes";
  else if (target_id == L"legacy_debug") output->name = L"debug";
  else if (target_id == L"legacy_logs") output->name = L"logs";
  else if (target_id == L"legacy_temp") output->name = L"temp";
  else if (target_id == L"legacy_workspace") {
    output->name = L"workspace";
    output->reject_epoch_2_child = true;
  } else {
    return false;
  }
  return true;
}

bool VerifyDeletionOwnershipManifest(
    NtCreateFileFn nt_create_file, const Lease* lease) {
  HANDLE manifest = OpenRelative(
      nt_create_file, lease->transition, L"root-manifest.json", false, FILE_OPEN,
      GENERIC_READ | FILE_READ_ATTRIBUTES | SYNCHRONIZE, FILE_SHARE_READ);
  if (manifest == INVALID_HANDLE_VALUE || IsReparsePoint(manifest)) {
    CloseHandleIfValid(manifest);
    return false;
  }
  LARGE_INTEGER size{};
  if (!GetFileSizeEx(manifest, &size) || size.QuadPart < 0 ||
      static_cast<unsigned long long>(size.QuadPart) != lease->expected_manifest.size()) {
    CloseHandleIfValid(manifest);
    return false;
  }
  std::string bytes(static_cast<size_t>(size.QuadPart), '\0');
  size_t offset = 0;
  while (offset < bytes.size()) {
    DWORD read = 0;
    if (!ReadFile(
            manifest, bytes.data() + offset,
            static_cast<DWORD>(bytes.size() - offset), &read, nullptr) || read == 0) {
      CloseHandleIfValid(manifest);
      return false;
    }
    offset += read;
  }
  CloseHandleIfValid(manifest);
  return bytes == lease->expected_manifest;
}

HANDLE OpenProductTarget(
    NtCreateFileFn nt_create_file, HANDLE product,
    const ProductDeleteTarget& target, const char** error_code) {
  HANDLE result = OpenRelativeAny(
      nt_create_file, product, target.name,
      FILE_READ_ATTRIBUTES | FILE_TRAVERSE | DELETE | SYNCHRONIZE,
      FILE_SHARE_READ | FILE_SHARE_WRITE);
  if (result == INVALID_HANDLE_VALUE) {
    const DWORD error = GetLastError();
    *error_code = error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND
        ? "EPOCH2_WIN32_DELETE_TARGET_MISSING"
        : "EPOCH2_WIN32_DELETE_TARGET_OPEN_FAILED";
    return INVALID_HANDLE_VALUE;
  }
  if (IsReparsePoint(result)) {
    CloseHandleIfValid(result);
    *error_code = "EPOCH2_WIN32_DELETE_REPARSE_POINT";
    return INVALID_HANDLE_VALUE;
  }
  return result;
}

bool EnumerateDirectoryEntries(
    HANDLE directory, std::vector<NativeDirectoryEntry>* entries,
    const char** error_code) {
  alignas(FILE_ID_BOTH_DIR_INFO) std::array<unsigned char, 64 * 1024> buffer{};
  bool restart = true;
  std::set<std::wstring> canonical_names;
  for (;;) {
    std::fill(buffer.begin(), buffer.end(), 0);
    const FILE_INFO_BY_HANDLE_CLASS info_class = restart
        ? FileIdBothDirectoryRestartInfo
        : FileIdBothDirectoryInfo;
    if (!GetFileInformationByHandleEx(
            directory, info_class, buffer.data(), static_cast<DWORD>(buffer.size()))) {
      const DWORD error = GetLastError();
      if (error == ERROR_NO_MORE_FILES) return true;
      *error_code = "EPOCH2_WIN32_DELETE_ENUMERATION_FAILED";
      return false;
    }
    restart = false;
    size_t offset = 0;
    for (;;) {
      if (offset + offsetof(FILE_ID_BOTH_DIR_INFO, FileName) > buffer.size()) {
        *error_code = "EPOCH2_WIN32_DELETE_ENUMERATION_INVALID";
        return false;
      }
      const auto* entry = reinterpret_cast<const FILE_ID_BOTH_DIR_INFO*>(
          buffer.data() + offset);
      if (entry->FileNameLength % sizeof(wchar_t) != 0 ||
          offset + offsetof(FILE_ID_BOTH_DIR_INFO, FileName) + entry->FileNameLength >
              buffer.size()) {
        *error_code = "EPOCH2_WIN32_DELETE_ENUMERATION_INVALID";
        return false;
      }
      const std::wstring name(
          entry->FileName, entry->FileNameLength / sizeof(wchar_t));
      if (name != L"." && name != L"..") {
        if (!IsSafeSegment(name) || !canonical_names.insert(Lower(name)).second) {
          *error_code = "EPOCH2_WIN32_DELETE_ENUMERATION_INVALID";
          return false;
        }
        entries->push_back(NativeDirectoryEntry{
            name,
            entry->FileId,
            (entry->FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0,
        });
      }
      if (entry->NextEntryOffset == 0) break;
      if (entry->NextEntryOffset < offsetof(FILE_ID_BOTH_DIR_INFO, FileName) ||
          offset + entry->NextEntryOffset >= buffer.size()) {
        *error_code = "EPOCH2_WIN32_DELETE_ENUMERATION_INVALID";
        return false;
      }
      offset += entry->NextEntryOffset;
    }
  }
}

bool InspectDeleteSubtree(
    NtCreateFileFn nt_create_file,
    NtQueryInformationFileFn nt_query_information_file,
    HANDLE handle,
    const std::vector<std::wstring>& relative_segments,
    size_t depth, size_t* total_characters,
    std::vector<DeleteEntry>* entries, const char** error_code) {
  if (depth > 256 || entries->size() >= 100000) {
    *error_code = "EPOCH2_WIN32_DELETE_TREE_LIMIT_EXCEEDED";
    return false;
  }
  if (IsReparsePoint(handle)) {
    *error_code = "EPOCH2_WIN32_DELETE_REPARSE_POINT";
    return false;
  }
  bool directory = false;
  NativeFileIdentity identity;
  if (!IsDirectoryHandle(handle, &directory) || !GetNativeFileIdentity(handle, &identity)) {
    *error_code = "EPOCH2_WIN32_DELETE_IDENTITY_FAILED";
    return false;
  }
  if (directory) {
    std::vector<NativeDirectoryEntry> children;
    if (!EnumerateDirectoryEntries(handle, &children, error_code)) return false;
    std::sort(children.begin(), children.end(), [](const auto& left, const auto& right) {
      return left.name < right.name;
    });
    for (const NativeDirectoryEntry& child_entry : children) {
      *total_characters += child_entry.name.size();
      if (*total_characters > 4 * 1024 * 1024) {
        *error_code = "EPOCH2_WIN32_DELETE_TREE_LIMIT_EXCEEDED";
        return false;
      }
      HANDLE child = OpenRelativeAny(
          nt_create_file, handle, child_entry.name,
          FILE_READ_ATTRIBUTES | FILE_TRAVERSE | SYNCHRONIZE |
              (child_entry.directory ? FILE_LIST_DIRECTORY : 0),
          FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE);
      if (child == INVALID_HANDLE_VALUE) {
        *error_code = "EPOCH2_WIN32_DELETE_TREE_CHANGED";
        return false;
      }
      LARGE_INTEGER opened_file_id{};
      bool opened_directory = false;
      if (!GetInternalFileId(nt_query_information_file, child, &opened_file_id) ||
          opened_file_id.QuadPart != child_entry.file_id.QuadPart ||
          !IsDirectoryHandle(child, &opened_directory) ||
          opened_directory != child_entry.directory) {
        CloseHandleIfValid(child);
        *error_code = "EPOCH2_WIN32_DELETE_TREE_CHANGED";
        return false;
      }
      std::vector<std::wstring> child_segments = relative_segments;
      child_segments.push_back(child_entry.name);
      const bool inspected = InspectDeleteSubtree(
          nt_create_file, nt_query_information_file, child,
          child_segments, depth + 1,
          total_characters, entries, error_code);
      CloseHandleIfValid(child);
      if (!inspected) return false;
    }
  }
  entries->push_back(DeleteEntry{relative_segments, identity, directory});
  return true;
}

HANDLE OpenDescendantForDelete(
    NtCreateFileFn nt_create_file, HANDLE root,
    const std::vector<std::wstring>& segments, const char** error_code) {
  HANDLE parent = root;
  bool owns_parent = false;
  for (size_t index = 0; index < segments.size(); ++index) {
    const bool final = index + 1 == segments.size();
    HANDLE child = final
        ? OpenRelativeAny(
            nt_create_file, parent, segments[index],
            FILE_READ_ATTRIBUTES | DELETE | SYNCHRONIZE,
            FILE_SHARE_READ | FILE_SHARE_WRITE)
        : OpenRelative(
            nt_create_file, parent, segments[index], true, FILE_OPEN,
            kReadDirectoryAccess, FILE_SHARE_READ | FILE_SHARE_WRITE);
    if (owns_parent) CloseHandleIfValid(parent);
    owns_parent = true;
    parent = child;
    if (parent == INVALID_HANDLE_VALUE) {
      *error_code = "EPOCH2_WIN32_DELETE_TREE_CHANGED";
      return INVALID_HANDLE_VALUE;
    }
    if (IsReparsePoint(parent)) {
      CloseHandleIfValid(parent);
      *error_code = "EPOCH2_WIN32_DELETE_REPARSE_POINT";
      return INVALID_HANDLE_VALUE;
    }
  }
  return parent;
}

bool MarkHandleForDelete(HANDLE handle, const char** error_code) {
  FILE_DISPOSITION_INFO_EX disposition{};
  disposition.Flags = FILE_DISPOSITION_FLAG_DELETE |
      FILE_DISPOSITION_FLAG_POSIX_SEMANTICS |
      FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE;
  if (SetFileInformationByHandle(
          handle, FileDispositionInfoEx, &disposition, sizeof(disposition))) {
    return true;
  }
  const DWORD error = GetLastError();
  *error_code = error == ERROR_INVALID_PARAMETER || error == ERROR_NOT_SUPPORTED
      ? "EPOCH2_WIN32_DELETE_API_UNSUPPORTED"
      : "EPOCH2_WIN32_DELETE_FAILED";
  return false;
}

napi_value CreateDeleteSummary(
    napi_env env, bool exists, size_t files, size_t directories,
    const NativeFileIdentity* root_identity) {
  napi_value result;
  napi_value exists_value;
  napi_value files_value;
  napi_value directories_value;
  napi_create_object(env, &result);
  napi_get_boolean(env, exists, &exists_value);
  napi_create_uint32(env, static_cast<uint32_t>(files), &files_value);
  napi_create_uint32(env, static_cast<uint32_t>(directories), &directories_value);
  napi_set_named_property(env, result, "exists", exists_value);
  napi_set_named_property(env, result, "files", files_value);
  napi_set_named_property(env, result, "directories", directories_value);
  if (root_identity != nullptr) {
    const std::string root_file_id = BytesToHex(
        root_identity->file_id.data(), root_identity->file_id.size());
    napi_value root_value;
    napi_create_string_utf8(env, root_file_id.c_str(), NAPI_AUTO_LENGTH, &root_value);
    napi_set_named_property(env, result, "rootFileId", root_value);
  }
  return result;
}

napi_value ProcessProductTree(
    napi_env env, napi_callback_info info, bool delete_tree) {
  napi_value args[1];
  Lease* lease = GetLeaseCall(env, info, 1, args);
  if (lease == nullptr) return nullptr;
  ProductDeleteTarget target;
  if (!ResolveProductDeleteTarget(env, args[0], &target)) {
    return ThrowCode(env, "EPOCH2_WIN32_DELETE_TARGET_NOT_ALLOWED");
  }
  NtCreateFileFn nt_create_file = ResolveNtCreateFile();
  NtQueryInformationFileFn nt_query_information_file = ResolveNtQueryInformationFile();
  if (nt_create_file == nullptr || nt_query_information_file == nullptr) {
    return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");
  }
  if (!VerifyDeletionOwnershipManifest(nt_create_file, lease)) {
    return ThrowCode(env, "EPOCH2_WIN32_DELETE_OWNERSHIP_INVALID");
  }
  const char* error_code = nullptr;
  HANDLE root = OpenProductTarget(
      nt_create_file, lease->product, target, &error_code);
  if (root == INVALID_HANDLE_VALUE) {
    if (error_code != nullptr &&
        std::string(error_code) == "EPOCH2_WIN32_DELETE_TARGET_MISSING") {
      return CreateDeleteSummary(env, false, 0, 0, nullptr);
    }
    return ThrowCode(env, error_code == nullptr
        ? "EPOCH2_WIN32_DELETE_TARGET_OPEN_FAILED" : error_code);
  }
  if (target.reject_epoch_2_child) {
    if (lease->protected_epoch != INVALID_HANDLE_VALUE) {
      CloseHandleIfValid(root);
      return ThrowCode(env, "EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT");
    }
    HANDLE epoch = OpenRelativeAny(
        nt_create_file, root, L"epoch-2",
        FILE_READ_ATTRIBUTES | SYNCHRONIZE,
        FILE_SHARE_READ | FILE_SHARE_WRITE);
    if (epoch != INVALID_HANDLE_VALUE) {
      CloseHandleIfValid(epoch);
      CloseHandleIfValid(root);
      return ThrowCode(env, "EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT");
    }
    const DWORD epoch_error = GetLastError();
    if (epoch_error != ERROR_FILE_NOT_FOUND && epoch_error != ERROR_PATH_NOT_FOUND) {
      CloseHandleIfValid(root);
      return ThrowCode(env, "EPOCH2_WIN32_DELETE_TREE_CHANGED");
    }
  }
  bool root_is_directory = false;
  if (!IsDirectoryHandle(root, &root_is_directory)) {
    CloseHandleIfValid(root);
    return ThrowCode(env, "EPOCH2_WIN32_DELETE_IDENTITY_FAILED");
  }
  HANDLE inspection = root;
  if (root_is_directory) {
    inspection = OpenRelative(
        nt_create_file, lease->product, target.name, true, FILE_OPEN,
        kReadDirectoryAccess, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE);
    if (inspection == INVALID_HANDLE_VALUE || IsReparsePoint(inspection)) {
      CloseHandleIfValid(inspection);
      CloseHandleIfValid(root);
      return ThrowCode(env, "EPOCH2_WIN32_DELETE_TREE_CHANGED");
    }
  }
  std::vector<DeleteEntry> entries;
  size_t total_characters = 0;
  const bool inspected = InspectDeleteSubtree(
      nt_create_file, nt_query_information_file, inspection,
      {}, 0, &total_characters, &entries, &error_code);
  if (inspection != root) CloseHandleIfValid(inspection);
  if (!inspected || entries.empty()) {
    CloseHandleIfValid(root);
    return ThrowCode(env, error_code == nullptr
        ? "EPOCH2_WIN32_DELETE_ENUMERATION_FAILED" : error_code);
  }
  size_t files = 0;
  size_t directories = 0;
  NativeFileIdentity protected_epoch_identity;
  const bool has_protected_epoch = lease->protected_epoch != INVALID_HANDLE_VALUE;
  if (has_protected_epoch &&
      !GetNativeFileIdentity(lease->protected_epoch, &protected_epoch_identity)) {
    CloseHandleIfValid(root);
    return ThrowCode(env, "EPOCH2_WIN32_DELETE_IDENTITY_FAILED");
  }
  for (const DeleteEntry& entry : entries) {
    entry.directory ? ++directories : ++files;
    if (has_protected_epoch &&
        SameNativeFileIdentity(entry.identity, protected_epoch_identity)) {
      CloseHandleIfValid(root);
      return ThrowCode(env, "EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT");
    }
    if (target.reject_epoch_2_child && entry.segments.size() == 1 &&
        Lower(entry.segments[0]) == L"epoch-2") {
      CloseHandleIfValid(root);
      return ThrowCode(env, "EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT");
    }
  }
  const NativeFileIdentity root_identity = entries.back().identity;
  NativeFileIdentity held_root_identity;
  if (!GetNativeFileIdentity(root, &held_root_identity) ||
      !SameNativeFileIdentity(held_root_identity, root_identity)) {
    CloseHandleIfValid(root);
    return ThrowCode(env, "EPOCH2_WIN32_DELETE_TREE_CHANGED");
  }
  if (!delete_tree) {
    CloseHandleIfValid(root);
    return CreateDeleteSummary(env, true, files, directories, &root_identity);
  }
  for (size_t index = 0; index + 1 < entries.size(); ++index) {
    const DeleteEntry& entry = entries[index];
    HANDLE child = OpenDescendantForDelete(
        nt_create_file, root, entry.segments, &error_code);
    if (child == INVALID_HANDLE_VALUE) {
      CloseHandleIfValid(root);
      return ThrowCode(env, error_code);
    }
    bool child_directory = false;
    NativeFileIdentity child_identity;
    if (!IsDirectoryHandle(child, &child_directory) ||
        !GetNativeFileIdentity(child, &child_identity) ||
        child_directory != entry.directory ||
        !SameNativeFileIdentity(child_identity, entry.identity)) {
      CloseHandleIfValid(child);
      CloseHandleIfValid(root);
      return ThrowCode(env, "EPOCH2_WIN32_DELETE_TREE_CHANGED");
    }
    if (!MarkHandleForDelete(child, &error_code)) {
      CloseHandleIfValid(child);
      CloseHandleIfValid(root);
      return ThrowCode(env, error_code);
    }
    CloseHandleIfValid(child);
  }
  NativeFileIdentity current_root_identity;
  if (!GetNativeFileIdentity(root, &current_root_identity) ||
      !SameNativeFileIdentity(current_root_identity, root_identity) ||
      !MarkHandleForDelete(root, &error_code)) {
    CloseHandleIfValid(root);
    return ThrowCode(env, error_code == nullptr
        ? "EPOCH2_WIN32_DELETE_TREE_CHANGED" : error_code);
  }
  CloseHandleIfValid(root);
  return CreateDeleteSummary(env, true, files, directories, &root_identity);
}

napi_value LeaseInspectProductTree(napi_env env, napi_callback_info info) {
  return ProcessProductTree(env, info, false);
}

napi_value LeaseDeleteProductTree(napi_env env, napi_callback_info info) {
  return ProcessProductTree(env, info, true);
}

bool IsCrashTemporaryName(const std::wstring& name) {
  if (name.size() != 39 || name.rfind(L".svtmp-", 0) != 0) return false;
  return std::all_of(name.begin() + 7, name.end(), [](wchar_t ch) {
    return (ch >= L'0' && ch <= L'9') || (ch >= L'a' && ch <= L'f');
  });
}

bool IsKnownTransitionControlName(const std::wstring& name) {
  return name == L"root-manifest.json" ||
      name == L"epoch-transition.journal.json" ||
      name == L"epoch-transition.lock";
}

napi_value LeaseCleanupTransitionTemps(napi_env env, napi_callback_info info) {
  Lease* lease = GetLeaseCall(env, info, 0, nullptr);
  if (lease == nullptr) return nullptr;
  std::vector<NativeDirectoryEntry> entries;
  const char* error_code = nullptr;
  if (!EnumerateDirectoryEntries(lease->transition, &entries, &error_code)) {
    return ThrowCode(env, error_code);
  }
  NtCreateFileFn nt_create_file = ResolveNtCreateFile();
  NtQueryInformationFileFn nt_query_information_file = ResolveNtQueryInformationFile();
  if (nt_create_file == nullptr || nt_query_information_file == nullptr) {
    return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");
  }
  size_t removed = 0;
  std::vector<HANDLE> temporary_handles;
  std::sort(entries.begin(), entries.end(), [](const auto& left, const auto& right) {
    return left.name < right.name;
  });
  for (const NativeDirectoryEntry& entry : entries) {
    const std::wstring& name = entry.name;
    if (IsKnownTransitionControlName(name)) continue;
    if (name.rfind(L".svtmp-", 0) != 0) {
      for (HANDLE& handle : temporary_handles) CloseHandleIfValid(handle);
      return ThrowCode(env, "EPOCH2_WIN32_TEMP_NAME_INVALID");
    }
    if (!IsCrashTemporaryName(name)) {
      for (HANDLE& handle : temporary_handles) CloseHandleIfValid(handle);
      return ThrowCode(env, "EPOCH2_WIN32_TEMP_NAME_INVALID");
    }
    HANDLE temporary = OpenRelativeAny(
        nt_create_file, lease->transition, name,
        FILE_READ_ATTRIBUTES | DELETE | SYNCHRONIZE,
        FILE_SHARE_READ | FILE_SHARE_WRITE);
    if (temporary == INVALID_HANDLE_VALUE || IsReparsePoint(temporary)) {
      CloseHandleIfValid(temporary);
      for (HANDLE& handle : temporary_handles) CloseHandleIfValid(handle);
      return ThrowCode(env, "EPOCH2_WIN32_TEMP_REPARSE_OR_CHANGED");
    }
    bool directory = false;
    LARGE_INTEGER opened_file_id{};
    if (!GetInternalFileId(nt_query_information_file, temporary, &opened_file_id) ||
        opened_file_id.QuadPart != entry.file_id.QuadPart ||
        !IsDirectoryHandle(temporary, &directory) || directory || entry.directory) {
      CloseHandleIfValid(temporary);
      for (HANDLE& handle : temporary_handles) CloseHandleIfValid(handle);
      return ThrowCode(env, "EPOCH2_WIN32_TEMP_INVALID");
    }
    temporary_handles.push_back(temporary);
  }
  for (HANDLE& temporary : temporary_handles) {
    if (!MarkHandleForDelete(temporary, &error_code)) {
      for (HANDLE& handle : temporary_handles) CloseHandleIfValid(handle);
      return ThrowCode(env, error_code);
    }
    CloseHandleIfValid(temporary);
    ++removed;
  }
  napi_value result;
  napi_create_uint32(env, static_cast<uint32_t>(removed), &result);
  return result;
}

napi_value LeaseRelease(napi_env env, napi_callback_info info) {
  napi_value this_arg;
  void* data = nullptr;
  size_t argc = 0;
  if (napi_get_cb_info(env, info, &argc, nullptr, &this_arg, nullptr) != napi_ok ||
      napi_unwrap(env, this_arg, &data) != napi_ok || data == nullptr) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  ReleaseLease(static_cast<Lease*>(data));
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_value LeaseRootIdentity(napi_env env, napi_callback_info info) {
  napi_value this_arg;
  void* data = nullptr;
  size_t argc = 0;
  if (napi_get_cb_info(env, info, &argc, nullptr, &this_arg, nullptr) != napi_ok ||
      napi_unwrap(env, this_arg, &data) != napi_ok || data == nullptr) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  auto* lease = static_cast<Lease*>(data);
  if (lease == nullptr || lease->released) return ThrowCode(env, "EPOCH2_WIN32_LEASE_RELEASED");
  FILE_ID_INFO identity{};
  if (!GetFileInformationByHandleEx(
          lease->transition, FileIdInfo, &identity, sizeof(identity))) {
    return ThrowCode(env, "EPOCH2_WIN32_ROOT_IDENTITY_FAILED");
  }
  std::ostringstream volume;
  volume << std::hex << std::setfill('0') << std::setw(16) << identity.VolumeSerialNumber;
  const std::string file_id = BytesToHex(identity.FileId.Identifier, sizeof(identity.FileId.Identifier));
  napi_value result;
  napi_value volume_value;
  napi_value file_value;
  napi_create_object(env, &result);
  napi_create_string_utf8(env, volume.str().c_str(), NAPI_AUTO_LENGTH, &volume_value);
  napi_create_string_utf8(env, file_id.c_str(), NAPI_AUTO_LENGTH, &file_value);
  napi_set_named_property(env, result, "volumeSerial", volume_value);
  napi_set_named_property(env, result, "transitionFileId", file_value);
  return result;
}

void LeaseFinalizer(napi_env, void* data, void*) {
  auto* lease = static_cast<Lease*>(data);
  ReleaseLease(lease);
  delete lease;
}

napi_value AcquireEpochRootLease(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc != 1) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  napi_valuetype type;
  if (napi_typeof(env, args[0], &type) != napi_ok || type != napi_object) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  std::wstring mutex_name;
  std::wstring app_data_root;
  std::wstring product_directory;
  std::wstring transition_directory;
  std::wstring lock_file_name;
  if (!GetRequiredWideString(env, args[0], "mutexName", &mutex_name) ||
      !GetRequiredWideString(env, args[0], "appDataRoot", &app_data_root) ||
      !GetRequiredWideString(env, args[0], "productDirectory", &product_directory) ||
      !GetRequiredWideString(env, args[0], "transitionDirectory", &transition_directory) ||
      !GetRequiredWideString(env, args[0], "lockFileName", &lock_file_name)) {
    return nullptr;
  }
  if (!IsSafeMutexName(mutex_name) || !IsSafeSegment(product_directory) ||
      !IsSafeSegment(transition_directory) || !IsSafeSegment(lock_file_name) ||
      product_directory != STARVERSE_PRODUCT_NAME_W ||
      transition_directory != L".epoch-transition" ||
      lock_file_name != L"epoch-transition.lock") {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  NtCreateFileFn nt_create_file = ResolveNtCreateFile();
  if (nt_create_file == nullptr) return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");

  auto* lease = new Lease();
  if (!BuildExpectedRootManifest(app_data_root, &lease->expected_manifest)) {
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_ROOT_IDENTITY_FAILED");
  }
  lease->mutex = CreateMutexW(nullptr, FALSE, mutex_name.c_str());
  if (lease->mutex == nullptr) {
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_MUTEX_OPEN_FAILED");
  }
  const DWORD wait_result = WaitForSingleObject(lease->mutex, 0);
  if (wait_result == WAIT_TIMEOUT) {
    CloseHandle(lease->mutex);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_LEASE_BUSY");
  }
  if (wait_result != WAIT_OBJECT_0 && wait_result != WAIT_ABANDONED) {
    CloseHandle(lease->mutex);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_MUTEX_WAIT_FAILED");
  }
  const char* open_error = nullptr;
  lease->app_data = OpenAppDataRoot(
      nt_create_file, app_data_root, &lease->ancestry, &open_error);
  if (lease->app_data == INVALID_HANDLE_VALUE) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, open_error);
  }
  lease->product = OpenRelative(
      nt_create_file, lease->app_data, product_directory, true, FILE_OPEN_IF,
      kMutableDirectoryAccess, FILE_SHARE_READ | FILE_SHARE_WRITE);
  if (lease->product == INVALID_HANDLE_VALUE || IsReparsePoint(lease->product)) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED");
  }
  lease->protected_workspace = OpenRelative(
      nt_create_file, lease->product, L"workspace", true, FILE_OPEN,
      kReadDirectoryAccess,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE);
  if (lease->protected_workspace != INVALID_HANDLE_VALUE) {
    if (IsReparsePoint(lease->protected_workspace)) {
      ReleaseLease(lease);
      delete lease;
      return ThrowCode(env, "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED");
    }
    lease->protected_epoch = OpenRelativeAny(
        nt_create_file, lease->protected_workspace, L"epoch-2",
        FILE_READ_ATTRIBUTES | SYNCHRONIZE,
        FILE_SHARE_READ | FILE_SHARE_WRITE);
    if (lease->protected_epoch == INVALID_HANDLE_VALUE) {
      const DWORD epoch_error = GetLastError();
      if (epoch_error != ERROR_FILE_NOT_FOUND && epoch_error != ERROR_PATH_NOT_FOUND) {
        ReleaseLease(lease);
        delete lease;
        return ThrowCode(env, "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED");
      }
    }
  } else {
    const DWORD workspace_error = GetLastError();
    if (workspace_error != ERROR_FILE_NOT_FOUND && workspace_error != ERROR_PATH_NOT_FOUND) {
      ReleaseLease(lease);
      delete lease;
      return ThrowCode(env, "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED");
    }
  }
  lease->transition = OpenRelative(
      nt_create_file, lease->product, transition_directory, true, FILE_OPEN_IF,
      kMutableDirectoryAccess, FILE_SHARE_READ | FILE_SHARE_WRITE);
  if (lease->transition == INVALID_HANDLE_VALUE || IsReparsePoint(lease->transition)) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED");
  }
  lease->lock_file = OpenRelative(
      nt_create_file, lease->transition, lock_file_name, false, FILE_OPEN_IF,
      GENERIC_READ | GENERIC_WRITE | DELETE | SYNCHRONIZE, 0);
  if (lease->lock_file == INVALID_HANDLE_VALUE || IsReparsePoint(lease->lock_file)) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_LOCK_OPEN_FAILED");
  }

  napi_value result;
  if (napi_create_object(env, &result) != napi_ok ||
      napi_wrap(env, result, lease, LeaseFinalizer, nullptr, nullptr) != napi_ok) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_CONTRACT_INVALID");
  }
  napi_property_descriptor properties[] = {
      {"release", nullptr, LeaseRelease, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"rootIdentity", nullptr, LeaseRootIdentity, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"readTransitionFile", nullptr, LeaseReadTransitionFile, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"writeTransitionFile", nullptr, LeaseWriteTransitionFile, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"inspectOwnedTarget", nullptr, LeaseInspectProductTree, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"deleteOwnedTarget", nullptr, LeaseDeleteProductTree, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"cleanupTransitionTemps", nullptr, LeaseCleanupTransitionTemps, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  if (napi_define_properties(env, result, 7, properties) != napi_ok) {
    void* removed = nullptr;
    napi_remove_wrap(env, result, &removed);
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_CONTRACT_INVALID");
  }
  return result;
}

napi_value SelfTest(napi_env env, napi_callback_info) {
  if (ResolveNtCreateFile() == nullptr) return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");
  uint32_t napi_version = 0;
  napi_get_version(env, &napi_version);
  napi_value result;
  napi_value version;
  napi_value win32;
  napi_create_object(env, &result);
  napi_create_uint32(env, napi_version, &version);
  napi_get_boolean(env, true, &win32);
  napi_set_named_property(env, result, "napiVersion", version);
  napi_set_named_property(env, result, "win32", win32);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor functions[] = {
      {"acquireEpochRootLease", nullptr, AcquireEpochRootLease, nullptr, nullptr, nullptr, napi_default_jsproperty, nullptr},
      {"selfTest", nullptr, SelfTest, nullptr, nullptr, nullptr, napi_default_jsproperty, nullptr},
  };
  napi_define_properties(env, exports, 2, functions);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
