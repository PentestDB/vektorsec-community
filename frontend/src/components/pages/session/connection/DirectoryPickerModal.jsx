"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Spin, Tooltip } from "antd";
import {
  ArrowUpOutlined,
  FolderFilled,
  HomeOutlined,
  ReloadOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useMutation } from "react-query";
import { listWorkspaceDirectories } from "@/services/workspace.service";
import styles from "@/styles/pages/Connection.module.scss";

function breadcrumbs(currentPath) {
  if (!currentPath || currentPath === "/") return [{ label: "/", path: "/" }];
  const parts = currentPath.split("/").filter(Boolean);
  return [
    { label: "/", path: "/" },
    ...parts.map((part, index) => ({
      label: part,
      path: `/${parts.slice(0, index + 1).join("/")}`,
    })),
  ];
}

function getDirectoryFilter(pathInput, listing) {
  const value = pathInput.trim();
  const currentPath = listing?.currentPath;
  if (!value || !currentPath || value === currentPath || value === `${currentPath}/`) return "";

  const absolutePrefix = currentPath === "/" ? "/" : `${currentPath}/`;
  if (value.startsWith(absolutePrefix)) {
    const nextSegment = value.slice(absolutePrefix.length);
    if (!nextSegment.includes("/")) return nextSegment;
  }

  if (currentPath === listing?.homePath && value.startsWith("~/")) {
    const nextSegment = value.slice(2);
    if (!nextSegment.includes("/")) return nextSegment;
  }

  // A bare value is treated as a folder-name filter within the open directory.
  if (!value.includes("/")) return value;
  return "";
}

export default function DirectoryPickerModal({
  open,
  workspaceId,
  workHost,
  selectedPath,
  onCancel,
  onSelect,
}) {
  const [listing, setListing] = useState(null);
  const [pathInput, setPathInput] = useState("~");
  const [error, setError] = useState("");
  const crumbs = useMemo(() => breadcrumbs(listing?.currentPath), [listing?.currentPath]);
  const filterTerm = useMemo(() => getDirectoryFilter(pathInput, listing), [pathInput, listing]);
  const filteredDirectories = useMemo(() => {
    const directories = listing?.directories ?? [];
    if (!filterTerm) return directories;
    const query = filterTerm.toLocaleLowerCase();
    return directories.filter((directory) => directory.name.toLocaleLowerCase().includes(query));
  }, [filterTerm, listing?.directories]);

  const browseMutation = useMutation(listWorkspaceDirectories, {
    onSuccess: (result) => {
      setListing(result);
      setPathInput(result.currentPath);
      setError("");
    },
    onError: (requestError) => {
      setError(requestError?.response?.data?.message || "Could not open this directory");
    },
  });

  const browse = (path = "~") => {
    if (!workspaceId || !workHost?.kind) return;
    browseMutation.mutate({ workspaceId, workHost, path: path.trim() || "~" });
  };

  const openEnteredPath = () => {
    const exactMatch = filterTerm && filteredDirectories.find(
      (directory) => directory.name.toLocaleLowerCase() === filterTerm.toLocaleLowerCase(),
    );
    browse(exactMatch?.path || pathInput);
  };

  useEffect(() => {
    if (!open) return;
    setListing(null);
    setPathInput("~");
    setError("");
    browse("~");
    // Re-open at home whenever the host changes or the picker is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, workHost?.kind, workHost?.sshProfileAlias]);

  return (
    <Modal
      open={open}
      width={760}
      title="Choose a work folder"
      onCancel={onCancel}
      destroyOnHidden
      className={styles.directoryModal}
      footer={[
        <Button key="cancel" onClick={onCancel}>Cancel</Button>,
        <Button
          key="select"
          type="primary"
          disabled={!listing?.currentPath}
          onClick={() => onSelect(listing.currentPath)}
        >
          Select this folder
        </Button>,
      ]}
    >
      <div className={styles.directoryContext}>
        Browsing <strong>{workHost.kind === "ssh" ? "remote SSH host" : "local host"}</strong>
        {selectedPath && <span>Current selection: <code>{selectedPath}</code></span>}
      </div>

      <div className={styles.directoryPathRow}>
        <Input
          value={pathInput}
          aria-label="Directory path"
          placeholder="Enter an absolute path or ~/path"
          onChange={(event) => setPathInput(event.target.value)}
          onPressEnter={openEnteredPath}
        />
        <Button onClick={openEnteredPath} loading={browseMutation.isLoading}>Go</Button>
      </div>

      {filterTerm && (
        <div className={styles.directoryFilterStatus} role="status">
          <span>
            Showing {filteredDirectories.length} of {listing?.directories?.length || 0} folders matching
            {" "}<strong>“{filterTerm}”</strong>
          </span>
          <button type="button" onClick={() => setPathInput(listing?.currentPath || "~")}>Clear filter</button>
        </div>
      )}

      {error && <Alert type="error" showIcon message={error} className={styles.directoryError} />}

      <div className={styles.directoryToolbar}>
        <Tooltip title="Home directory">
          <Button
            type="text"
            icon={<HomeOutlined />}
            aria-label="Home directory"
            disabled={browseMutation.isLoading}
            onClick={() => browse(listing?.homePath || "~")}
          />
        </Tooltip>
        <Tooltip title="Parent directory">
          <Button
            type="text"
            icon={<ArrowUpOutlined />}
            aria-label="Parent directory"
            disabled={!listing?.parentPath || browseMutation.isLoading}
            onClick={() => browse(listing.parentPath)}
          />
        </Tooltip>
        <Tooltip title="Refresh">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            aria-label="Refresh directory"
            disabled={!listing?.currentPath || browseMutation.isLoading}
            onClick={() => browse(listing.currentPath)}
          />
        </Tooltip>
        <div className={styles.directoryBreadcrumbs} aria-label="Current directory breadcrumbs">
          {crumbs.map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              {index > 0 && <RightOutlined />}
              <button type="button" onClick={() => browse(crumb.path)}>{crumb.label}</button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className={styles.directoryList} aria-busy={browseMutation.isLoading}>
        {browseMutation.isLoading && !listing ? (
          <div className={styles.directoryLoading}><Spin /><span>Loading folders…</span></div>
        ) : filteredDirectories.length ? (
          filteredDirectories.map((directory) => (
            <button
              type="button"
              key={directory.path}
              className={styles.directoryRow}
              onClick={() => browse(directory.path)}
            >
              <FolderFilled />
              <span>{directory.name}</span>
              <RightOutlined />
            </button>
          ))
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={filterTerm ? `No folders match “${filterTerm}”` : "No subfolders"}
          />
        )}
      </div>
    </Modal>
  );
}
