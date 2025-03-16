import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  user: null,
  isLoggedIn: false,
  expiresAt: null,
  status: "stopped",
  readyToConnect: false,
  disclaimer: false,
  containerIP: null,
  recon: false,
  vnc: {
    host: null,
    password: null,
    active: false,
  },
  noOfExtends: 0,
  sessions: [], // [{ id: session_id, is_main: true, is_active: true, type: "session" | "netcat" | "vpn" | "gui" }];
  cancelSource: null,
};

export const userSlice = createSlice({
  name: "user",
  initialState,

  reducers: {
    loginUser: (state, action) => {
      state.user = action.payload;
      state.isLoggedIn = true;
    },
    update: (state, action) => {
      const prevUser = state.user;
      state.user = { ...prevUser, ...action.payload };
    },
    logout: (state) => {
      state = initialState;
    },
    updateExploitBox: (state, action) => {
      state.expiresAt = action.payload.expiresAt;
      state.noOfExtends = action.payload.extends;
      state.status = action.payload.status;
      state.readyToConnect = action.payload.readyToConnect;
      state.containerIP = action.payload.containerIP;
    },
    updateExpiry: (state, action) => {
      state.expiresAt = action.payload.expiresAt;
      state.noOfExtends = action.payload.extends;
      // state.status = action.payload.status;
      // state.readyToConnect = action.payload.readyToConnect;
      // state.containerIP = action.payload.containerIP;
    },
    expireContainer: (state, action) => {
      state.expiresAt = null;
      state.noOfExtends = 0;
      state.status = "stopped";
    },
    resetSessions: (state, action) => {
      state.sessions = [];
    },
    updateSessions: (state, action) => {
      state.sessions = action.payload;
    },
    updateCurrentSession: (state, action) => {
      const session_id = action.payload;
      const sessions = state.sessions.map((s) => {
        return { ...s, is_active: s.id === session_id ? true : false };
      });

      state.sessions = sessions;
    },
    closeSession: (state, action) => {
      const session_id = action.payload;

      const sessions = state.sessions.filter((s) => s.id !== session_id);

      const active_session = sessions.find((s) => s.is_active);

      if (!active_session) {
        sessions[0].is_active = true;
      }

      state.sessions = sessions;
    },
    updateVNC: (state, action) => {
      state.vnc = action.payload;
    },
    updateDisclaimer: (state, action) => {
      state.disclaimer = action.payload;
    },
    setRecon: (state, action) => {
      state.recon = action.payload;
    },
    updateCancelSource: (state, action) => {
      state.cancelSource = action.payload;
    },
  },
});

export const {
  loginUser,
  update,
  logout,
  resetSessions,
  updateContainerIp,
  updateExpiry,
  updateExploitBox,
  updateSessions,
  closeSession,
  expireContainer,
  updateCurrentSession,
  updateVNC,
  updateDisclaimer,
  setRecon,
} = userSlice.actions;
export default userSlice.reducer;
