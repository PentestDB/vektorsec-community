// store/socketSlice.js
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  sockets: [],
  terminal_height: 100,
  show_terminal: false,
  active_terminal: null,
};

const socketSlice = createSlice({
  name: "socket",
  initialState,
  reducers: {
    setSocket: (state, action) => {
      const currentSockets = state.sockets ?? [];

      currentSockets.push({
        id: action.payload.id,
        type: action.payload.type,
        is_main: action.payload.is_main,
      });

      state.sockets = currentSockets;
    },
    updateTerminalHeight: (state, action) => {
      state.terminal_height = action.payload;
    },
    updateShowTerminal: (state, action) => {
      state.show_terminal = action.payload;
    },
    updateActiveTerminal: (state, action) => {
      state.active_terminal = action.payload;
    },
    updateVPNStatus: (state, action) => {
      const currentSockets = state.sockets ?? [];

      const vpnSocket = currentSockets.find((socket) => socket.type === "vpn");

      vpnSocket.connected = action.payload;

      state.sockets = currentSockets;
    },
    resetToInitialState: (state) => {
      return {
        ...initialState,
        sockets: state.sockets,
        active_terminal: state.active_terminal,
      };
    },
  },
});

export const {
  setSocket,
  updateTerminalHeight,
  updateShowTerminal,
  updateActiveTerminal,
  resetToInitialState,
  updateVPNStatus,
} = socketSlice.actions;
export default socketSlice.reducer;
