"use strict";

/**
 * Preload — exposes a minimal, context-isolated `window.vektorsec` bridge to the
 * renderer. No Node APIs leak into the page; every capability goes through a
 * narrow `ipcRenderer.invoke` handler defined in `main.js`.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vektorsec", {
  getHwid: () => ipcRenderer.invoke("drm:hwid"),
  getLicenseState: () => ipcRenderer.invoke("drm:state"),
  saveLicense: (key) => ipcRenderer.invoke("drm:save-license", key),
});
