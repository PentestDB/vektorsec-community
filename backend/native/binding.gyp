{
  "targets": [
    {
      "target_name": "drm_addon",
      "sources": ["src/drm_addon.cc"],
      "defines": ["NAPI_VERSION=8", "WIN32_LEAN_AND_MEAN", "NOMINMAX"],
      "conditions": [
        ["OS=='win'", {
          "libraries": ["iphlpapi.lib", "advapi32.lib"]
        }]
      ]
    }
  ]
}
