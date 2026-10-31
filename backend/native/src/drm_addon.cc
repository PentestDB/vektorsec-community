// VektorSec native DRM addon (N-API, C++).
//
// Moves the hardware-fingerprint collection (and, optionally, the embedded
// license public key) into a compiled binary so the "secret" parts of the DRM
// cannot be trivially patched by editing the JavaScript bundle.
//
// On Windows it reads:
//   - MachineGuid (registry, stable per OS install),
//   - the SMBIOS system UUID (GetSystemFirmwareTable),
//   - the physical MAC addresses (GetAdaptersAddresses).
// On non-Windows it returns an empty fingerprint and the JS fallback in
// `src/utils/drm/nativeBinding.ts` takes over.
//
// Build:  cd backend/native && node-gyp rebuild
//   (requires a C++ toolchain, e.g. MSVC Build Tools on Windows).
//
// Embed a license public key at build time with:
//   node-gyp rebuild -- -DVEKTORSEC_EMBEDDED_LICENSE_PUBLIC_KEY=\"...\"

#include <node_api.h>

#ifdef _WIN32
#include <windows.h>
#include <iphlpapi.h>
#include <string>
#include <vector>

#ifdef VEKTORSEC_EMBEDDED_LICENSE_PUBLIC_KEY
static const char* EMBEDDED_PUBLIC_KEY = VEKTORSEC_EMBEDDED_LICENSE_PUBLIC_KEY;
#else
static const char* EMBEDDED_PUBLIC_KEY = "";
#endif

#define NAPI_CALL(env, call)                                       \
  do {                                                             \
    if ((call) != napi_ok) return nullptr;                         \
  } while (0)

static std::string ReadRegistryString(HKEY root, const char* path, const char* name) {
  HKEY key = nullptr;
  if (RegOpenKeyExA(root, path, 0, KEY_READ, &key) != ERROR_SUCCESS) return "";
  char buf[512] = {0};
  DWORD size = sizeof(buf);
  DWORD type = 0;
  LONG rc = RegQueryValueExA(key, name, nullptr, &type, reinterpret_cast<LPBYTE>(buf), &size);
  RegCloseKey(key);
  return (rc == ERROR_SUCCESS && type == REG_SZ) ? std::string(buf) : "";
}

static std::string GetSmbiosSystemUuid() {
  const DWORD signature = 'RSMB';
  DWORD size = GetSystemFirmwareTable(signature, 0, nullptr, 0);
  if (!size) return "";
  std::vector<BYTE> buf(size);
  if (GetSystemFirmwareTable(signature, 0, buf.data(), size) != size) return "";

  size_t offset = 0;
  while (offset + 4 <= buf.size()) {
    BYTE type = buf[offset];
    BYTE length = buf[offset + 1];
    if (type == 1 && length >= 8 && offset + 8 + 16 <= buf.size()) {
      static const char* hex = "0123456789ABCDEF";
      std::string uuid;
      uuid.reserve(32);
      for (int i = 0; i < 16; i++) {
        uuid += hex[(buf[offset + 8 + i] >> 4) & 0xF];
        uuid += hex[buf[offset + 8 + i] & 0xF];
      }
      return uuid;
    }
    if (length < 4) break;
    size_t end = offset + length;
    while (end + 1 < buf.size() && (buf[end] != 0 || buf[end + 1] != 0)) end++;
    offset = end + 2;
  }
  return "";
}

static std::vector<std::string> GetPhysicalMacs() {
  std::vector<std::string> macs;
  ULONG size = 0;
  if (GetAdaptersAddresses(AF_UNSPEC, 0, nullptr, nullptr, &size) != ERROR_BUFFER_OVERFLOW) return macs;
  std::vector<BYTE> buf(size);
  auto* addrs = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data());
  if (GetAdaptersAddresses(AF_UNSPEC, 0, nullptr, addrs, &size) != NO_ERROR) return macs;
  for (auto* a = addrs; a; a = a->Next) {
    if (a->PhysicalAddressLength != 6) continue;
    char m[18] = {0};
    snprintf(m, sizeof(m), "%02X:%02X:%02X:%02X:%02X:%02X",
             a->PhysicalAddress[0], a->PhysicalAddress[1], a->PhysicalAddress[2],
             a->PhysicalAddress[3], a->PhysicalAddress[4], a->PhysicalAddress[5]);
    macs.push_back(m);
  }
  return macs;
}

static napi_value GetHardwareFingerprintParts(napi_env env, napi_callback_info info) {
  napi_value result;
  NAPI_CALL(env, napi_create_array(env, &result));

  std::vector<std::string> parts;
  std::string guid = ReadRegistryString(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", "MachineGuid");
  if (!guid.empty()) parts.push_back("machine-guid:" + guid);
  std::string uuid = GetSmbiosSystemUuid();
  if (!uuid.empty()) parts.push_back("smbios-uuid:" + uuid);
  for (const auto& mac : GetPhysicalMacs()) parts.push_back("mac:" + mac);

  for (uint32_t i = 0; i < parts.size(); i++) {
    napi_value str;
    NAPI_CALL(env, napi_create_string_utf8(env, parts[i].c_str(), NAPI_AUTO_LENGTH, &str));
    NAPI_CALL(env, napi_set_element(env, result, i, str));
  }
  return result;
}

static napi_value GetEmbeddedLicensePublicKey(napi_env env, napi_callback_info info) {
  napi_value result;
  NAPI_CALL(env, napi_create_string_utf8(env, EMBEDDED_PUBLIC_KEY, NAPI_AUTO_LENGTH, &result));
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
      {"getHardwareFingerprintParts", nullptr, GetHardwareFingerprintParts, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"getEmbeddedLicensePublicKey", nullptr, GetEmbeddedLicensePublicKey, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  NAPI_CALL(env, napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc));
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

#else  // !_WIN32

static napi_value GetHardwareFingerprintParts(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_array(env, &result);
  return result;
}

static napi_value GetEmbeddedLicensePublicKey(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_string_utf8(env, "", NAPI_AUTO_LENGTH, &result);
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
      {"getHardwareFingerprintParts", nullptr, GetHardwareFingerprintParts, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"getEmbeddedLicensePublicKey", nullptr, GetEmbeddedLicensePublicKey, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

#endif  // _WIN32
