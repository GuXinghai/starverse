{
  "targets": [
    {
      "target_name": "starverse_epoch_win32",
      "sources": ["src/addon.cc"],
      "include_dirs": [".generated"],
      "libraries": ["bcrypt.lib"],
      "defines": [
        "NAPI_VERSION=8",
        "UNICODE",
        "_UNICODE",
        "_WIN32_WINNT=0x0A00"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "WarningLevel": "4",
          "WarnAsError": "true",
          "ExceptionHandling": "0"
        }
      }
    }
  ]
}
