#include <node_api.h>
#include <windows.h>
#include <winternl.h>

#include <algorithm>
#include <cstdint>
#include <cwctype>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace {

using NtCreateFileFn = NTSTATUS(NTAPI*)(
    PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES, PIO_STATUS_BLOCK, PLARGE_INTEGER,
    ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);
using RtlNtStatusToDosErrorFn = ULONG(WINAPI*)(NTSTATUS);

struct Lease {
  HANDLE mutex = nullptr;
  HANDLE app_data = INVALID_HANDLE_VALUE;
  HANDLE product = INVALID_HANDLE_VALUE;
  HANDLE transition = INVALID_HANDLE_VALUE;
  HANDLE lock_file = INVALID_HANDLE_VALUE;
  bool released = false;
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
  CloseHandleIfValid(lease->product);
  CloseHandleIfValid(lease->app_data);
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

DWORD NtStatusToWin32(NTSTATUS status) {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (ntdll == nullptr) return ERROR_GEN_FAILURE;
  auto convert = reinterpret_cast<RtlNtStatusToDosErrorFn>(
      GetProcAddress(ntdll, "RtlNtStatusToDosError"));
  return convert == nullptr ? ERROR_GEN_FAILURE : convert(status);
}

HANDLE OpenRelative(
    NtCreateFileFn nt_create_file, HANDLE parent, const std::wstring& name,
    bool directory, bool create, ACCESS_MASK access, ULONG share_access) {
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
      share_access, create ? FILE_OPEN_IF : FILE_OPEN, options, nullptr, 0);
  if (status < 0) {
    SetLastError(NtStatusToWin32(status));
    return INVALID_HANDLE_VALUE;
  }
  return result;
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
    NtCreateFileFn nt_create_file, const std::wstring& path, const char** error_code) {
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
  for (size_t index = 0; index < segments.size(); ++index) {
    const bool final_segment = index + 1 == segments.size();
    HANDLE child = OpenRelative(
        nt_create_file, current, segments[index], true, false,
        final_segment ? kMutableDirectoryAccess : kReadDirectoryAccess,
        FILE_SHARE_READ | FILE_SHARE_WRITE);
    CloseHandleIfValid(current);
    current = child;
    if (current == INVALID_HANDLE_VALUE || IsReparsePoint(current)) {
      CloseHandleIfValid(current);
      *error_code = "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED";
      return INVALID_HANDLE_VALUE;
    }
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
      !IsSafeSegment(transition_directory) || !IsSafeSegment(lock_file_name)) {
    return ThrowCode(env, "EPOCH2_WIN32_NATIVE_INPUT_INVALID");
  }
  NtCreateFileFn nt_create_file = ResolveNtCreateFile();
  if (nt_create_file == nullptr) return ThrowCode(env, "EPOCH2_WIN32_NT_API_UNAVAILABLE");

  auto* lease = new Lease();
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
  lease->app_data = OpenAppDataRoot(nt_create_file, app_data_root, &open_error);
  if (lease->app_data == INVALID_HANDLE_VALUE) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, open_error);
  }
  lease->product = OpenRelative(
      nt_create_file, lease->app_data, product_directory, true, true,
      kMutableDirectoryAccess, FILE_SHARE_READ | FILE_SHARE_WRITE);
  if (lease->product == INVALID_HANDLE_VALUE || IsReparsePoint(lease->product)) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED");
  }
  lease->transition = OpenRelative(
      nt_create_file, lease->product, transition_directory, true, true,
      kMutableDirectoryAccess, FILE_SHARE_READ | FILE_SHARE_WRITE);
  if (lease->transition == INVALID_HANDLE_VALUE || IsReparsePoint(lease->transition)) {
    ReleaseLease(lease);
    delete lease;
    return ThrowCode(env, "EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED");
  }
  lease->lock_file = OpenRelative(
      nt_create_file, lease->transition, lock_file_name, false, true,
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
  };
  if (napi_define_properties(env, result, 2, properties) != napi_ok) {
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
