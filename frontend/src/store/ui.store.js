import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useUIStore = create(
  persist(
    (set) => ({
      shellPanelWidth: 45,
      activeShellId: null,

      setShellPanelWidth: (width) => set({ shellPanelWidth: width }),
      setActiveShellId: (id) => set({ activeShellId: id }),
    }),
    {
      name: "pentest-copilot-ui",
    },
  ),
);
