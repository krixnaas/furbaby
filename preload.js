const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  settings: () => ipcRenderer.invoke('settings'),
  chat: (text) => ipcRenderer.invoke('chat', text),
  hitRects: (rects, grabbing) => ipcRenderer.send('hit-rects', rects, grabbing),
  model: (type) => ipcRenderer.invoke('model', type),
  moveBy: (dx, dy) => ipcRenderer.send('move-by', dx, dy),
  menu: () => ipcRenderer.send('menu'),
  motion: (speed, dir) => ipcRenderer.send('motion', speed, dir),
  onTurn: (fn) => ipcRenderer.on('turn', (_e, dir) => fn(dir)),
  rename: (name) => ipcRenderer.send('rename', name),
  dropPhoto: (file) => ipcRenderer.send('photo', webUtils.getPathForFile(file)),
  onSay: (fn) => ipcRenderer.on('say', (_e, text) => fn(text)),
  onTrick: (fn) => ipcRenderer.on('trick', (_e, t) => fn(t))
});
