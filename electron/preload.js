import pkg from 'electron';

const { contextBridge } = pkg;

contextBridge.exposeInMainWorld('electronAPI', {
  getServerInfo: () => ({
    port: process.env.PORT || 3000,
    dataDir: process.env.PS_DATA_DIR || '',
  }),
  isElectron: true,
});
