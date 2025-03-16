import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isVpnConnected: false,
  vpnLogs: null,
  isLoading: false,
};

export const vpnSlice = createSlice({
  name: "vpn",
  initialState,

  reducers: {
    setVpnConnected: (state, action) => {
      console.log(action.payload);
      state.isVpnConnected = action.payload;
    },
    setVpnLogs: (state, action) => {
      state.vpnLogs = action.payload;
    },
    setIsLoading: (state, action) => {
      state.isLoading = action.payload;
    },
  },
});

export const { setVpnConnected, setVpnLogs, setIsLoading } = vpnSlice.actions;

export default vpnSlice.reducer;
