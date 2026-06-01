import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sageOsOverlay", {
  onSurface(callback: (surface: string) => void) {
    ipcRenderer.on("sageos-overlay:surface", (_event, surface) => callback(String(surface)));
  },
});
