import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isVpnConnected: false,
  connections: [],
  profiles: [],
  isLoading: false,
};

export const vpnSlice = createSlice({
  name: "vpn",
  initialState,

  reducers: {
    setVpnConnected: (state, action) => {
      state.isVpnConnected = action.payload;
    },
    setVpnConnections: (state, action) => {
      state.connections = action.payload ?? [];
      state.isVpnConnected = state.connections.length > 0;
    },
    setVpnProfiles: (state, action) => {
      state.profiles = action.payload ?? [];
    },
    setIsLoading: (state, action) => {
      state.isLoading = action.payload;
    },
  },
});

export const {
  setVpnConnected,
  setVpnConnections,
  setVpnProfiles,
  setIsLoading,
} = vpnSlice.actions;

export default vpnSlice.reducer;
