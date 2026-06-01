import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sageOsOverlay", {
  onSurface(callback: (surface: string) => void) {
    ipcRenderer.on("sageos-overlay:surface", (_event, surface) => callback(String(surface)));
  },
  expand() {
    return ipcRenderer.invoke("sageos-overlay:expand");
  },
  collapse() {
    return ipcRenderer.invoke("sageos-overlay:collapse");
  },
  close() {
    return ipcRenderer.invoke("sageos-overlay:close");
  },
  setInteractivePointer(active: boolean) {
    return ipcRenderer.invoke("sageos-overlay:interactive-pointer", Boolean(active));
  },
});
