export const initTodo = [
  {
    step: 1,
    title: "Recon",
    status: "pending",
    substeps: [
      {
        step: 1,
        title: "NMAP Scan",
        status: "pending",
      },
      {
        step: 2,
        title: "Banner Grabbing",
        status: "pending",
      },
    ],
    commands: [
      {
        command: "nmap -sV -sC <target> -oA <session_id>.<extension>",
        status: "pending",
      },
    ],
  },
  {
    step: 2,
    title: "Enumeration",
    status: "in-progress",
    substeps: [
      {
        step: 2,
        title: "Directory Busting for any http/https pages",
        status: "pending",
      },
    ],
  },
];

export const genericInitTodo = [
  {
    step: 1,
    title: "Analysis",
    status: "pending",
    substeps: [
      {
        step: 1,
        title: "Understanding User Requirements",
        status: "pending",
      },
    ],
  },
];
