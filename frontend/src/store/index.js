import { configureStore } from "@reduxjs/toolkit";
import { combineReducers } from "redux";
import userReducer from "./user.slice";
import socketReducer from "./socket.slice";
import vpnReducer from "./vpn.slice"; // Import the VPN slice

import { persistReducer } from "redux-persist";
import { thunk } from "redux-thunk";

const isClient = typeof window !== "undefined";

const reducers = combineReducers({
  user: userReducer,
  socket: socketReducer,
  vpn: vpnReducer, // Include the VPN reducer
});

let store = configureStore({
  reducer: reducers,
  middleware: [thunk],
  devTools: true,
});

if (isClient) {
  const storage = require("redux-persist/lib/storage").default;

  const persistConfig = {
    key: "root",
    storage,
    whitelist: ["user", "socket", "vpn"],
  };

  const persistedReducer = persistReducer(persistConfig, reducers);

  store = configureStore({
    reducer: persistedReducer,
    middleware: [thunk],
  });
}

export default store;
