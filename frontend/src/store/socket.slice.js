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
    updateTerminalHeight: (state, action) => {
      state.terminal_height = action.payload;
    },
    updateShowTerminal: (state, action) => {
      state.show_terminal = action.payload;
    },
    updateActiveTerminal: (state, action) => {
      state.active_terminal = action.payload;
    },
    resetToInitialState: (state) => {
      return {
        ...initialState,
        active_terminal: state.active_terminal,
      };
    },
  },
});

export const {
  updateTerminalHeight,
  updateShowTerminal,
  updateActiveTerminal,
  resetToInitialState,
} = socketSlice.actions;
export default socketSlice.reducer;
