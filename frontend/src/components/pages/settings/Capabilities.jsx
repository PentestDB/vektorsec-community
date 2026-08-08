import Loader from "@/components/common/loader/Loader";
import {
  getCapabilities,
  updateCapabilities,
  detectCapabilities,
} from "@/services/user.service";
import styles from "@/styles/pages/Capabilities.module.scss";
import {
  Checkbox,
  Collapse,
  App,
  Tag,
  Tooltip,
  Button,
  Spin,
  Input,
} from "antd";
import { debounce } from "lodash";
import {
  MdOutlineCheckCircle,
  MdOutlineRadioButtonUnchecked,
} from "react-icons/md";
import { TbRefresh } from "react-icons/tb";
import {
  HiOutlineCog6Tooth,
  HiOutlineGlobeAlt,
  HiOutlineMagnifyingGlass,
  HiOutlineBolt,
  HiOutlineKey,
  HiOutlineBeaker,
  HiOutlinePhoto,
  HiOutlineCube,
  HiOutlineCodeBracket,
  HiOutlineCloud,
} from "react-icons/hi2";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useState, useMemo, useCallback } from "react";

const BUCKET_ICONS = {
  core: HiOutlineCog6Tooth,
  network: HiOutlineGlobeAlt,
  rev: HiOutlineMagnifyingGlass,
  pwn: HiOutlineBolt,
  crypto: HiOutlineKey,
  forensics: HiOutlineBeaker,
  stego: HiOutlinePhoto,
  web: HiOutlineCodeBracket,
  cloud: HiOutlineCloud,
};
const BUCKET_ICON_FALLBACK = HiOutlineCube;

const CapabilityItem = ({ cap, checked, installed, onChange }) => {
  return (
    <div className={styles.capabilityItem}>
      <div className={styles.capLeft}>
        <Checkbox checked={checked} onChange={(e) => onChange(cap.name, e.target.checked)} />
        <div className={styles.capInfo}>
          <div className={styles.capHeader}>
            <span className={styles.capName}>{cap.label}</span>
            <Tag
              className={styles.typeTag}
              color={cap.type === "binary" ? "blue" : "green"}
            >
              {cap.type === "binary" ? "CLI" : "Python"}
            </Tag>
            {installed && (
              <Tooltip title="Installed on exploit box">
                <MdOutlineCheckCircle className={styles.installedIcon} />
              </Tooltip>
            )}
            {!installed && checked && (
              <Tooltip title="Not detected on exploit box">
                <MdOutlineRadioButtonUnchecked className={styles.notInstalledIcon} />
              </Tooltip>
            )}
          </div>
          <div className={styles.capDesc}>{cap.description}</div>
          <div className={styles.capMeta}>
            <span className={styles.capSize}>{cap.size}</span>
            <code className={styles.capCmd}>{cap.name}</code>
          </div>
        </div>
      </div>
    </div>
  );
};

const CapabilitiesPage = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [detecting, setDetecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery("capabilities", getCapabilities);

  const updateMutation = useMutation(updateCapabilities, {
    onSuccess: () => {
      message.success("Capabilities updated");
      queryClient.invalidateQueries("capabilities");
    },
    onError: () => {
      message.error("Failed to update capabilities");
    },
  });

  const detectMutation = useMutation(detectCapabilities, {
    onSuccess: (result) => {
      setDetecting(false);
      const installed = result?.installedCapabilities ?? [];
      message.success(`Detection complete: ${installed.length} capabilities found`);
      queryClient.invalidateQueries("capabilities");
    },
    onError: () => {
      setDetecting(false);
      message.error("Detection failed. Ensure SSH/Exploit Box is connected.");
    },
  });

  const selectedSet = useMemo(
    () => new Set(data?.selectedCapabilities ?? []),
    [data?.selectedCapabilities]
  );

  const installedSet = useMemo(
    () => new Set(data?.installedCapabilities ?? []),
    [data?.installedCapabilities]
  );

  const debouncedUpdate = useCallback(
    debounce((caps) => {
      updateMutation.mutateAsync({ capabilities: caps });
    }, 500),
    []
  );

  const handleCapChange = (name, checked) => {
    const current = [...selectedSet];
    let updated;
    if (checked) {
      updated = [...current, name];
    } else {
      updated = current.filter((n) => n !== name);
    }
    debouncedUpdate(updated);
    queryClient.setQueryData("capabilities", (old) => ({
      ...old,
      selectedCapabilities: updated,
    }));
  };

  const handleSelectBucket = (bucketCaps, select) => {
    const current = [...selectedSet];
    const bucketNames = bucketCaps.map((c) => c.name);
    let updated;
    if (select) {
      const toAdd = bucketNames.filter((n) => !current.includes(n));
      updated = [...current, ...toAdd];
    } else {
      updated = current.filter((n) => !bucketNames.includes(n));
    }
    debouncedUpdate(updated);
    queryClient.setQueryData("capabilities", (old) => ({
      ...old,
      selectedCapabilities: updated,
    }));
  };

  const handleDetect = () => {
    setDetecting(true);
    detectMutation.mutateAsync();
  };

  if (isLoading) {
    return <Loader />;
  }

  const buckets = data?.buckets ?? [];

  const filterCap = (cap) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      cap.name?.toLowerCase().includes(q) ||
      cap.label?.toLowerCase().includes(q) ||
      cap.description?.toLowerCase().includes(q)
    );
  };

  const collapseItems = buckets.map((bucket) => {
    const filteredCaps = bucket.capabilities.filter(filterCap);
    if (filteredCaps.length === 0) return null;

    const selectedCount = filteredCaps.filter((c) =>
      selectedSet.has(c.name)
    ).length;
    const installedCount = filteredCaps.filter((c) =>
      installedSet.has(c.name)
    ).length;
    const allSelected =
      filteredCaps.length > 0 && selectedCount === filteredCaps.length;

    return {
      key: bucket.id,
      label: (
        <div className={styles.bucketHeader}>
          <div className={styles.bucketTitle}>
            <span className={styles.bucketIcon}>
              {(() => {
                const Icon = BUCKET_ICONS[bucket.id] || BUCKET_ICON_FALLBACK;
                return <Icon aria-hidden />;
              })()}
            </span>
            <span>{bucket.label}</span>
            <span className={styles.bucketCount}>
              {selectedCount}/{filteredCaps.length} selected
              {installedCount > 0 && (
                <span className={styles.installedCount}>
                  {" "}· {installedCount} installed
                </span>
              )}
            </span>
          </div>
          <div
            className={styles.selectAllBtn}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectBucket(filteredCaps, !allSelected);
            }}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </div>
        </div>
      ),
      children: (
        <div className={styles.bucketContent}>
          <p className={styles.bucketDesc}>{bucket.description}</p>
          <div className={styles.capGrid}>
            {filteredCaps.map((cap) => (
              <CapabilityItem
                key={cap.name}
                cap={cap}
                checked={selectedSet.has(cap.name)}
                installed={installedSet.has(cap.name)}
                onChange={handleCapChange}
              />
            ))}
          </div>
        </div>
      ),
    };
  }).filter(Boolean);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.searchWrapper}>
          <Input
            placeholder="Search capabilities..."
            prefix={<HiOutlineMagnifyingGlass className={styles.searchIcon} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            className={styles.searchInput}
          />
        </div>
        <div className={styles.stats}>
          <span>{selectedSet.size} capabilities selected</span>
          <span className={styles.statDivider}>·</span>
          <span>{installedSet.size} installed</span>
        </div>
        <Button
          type="primary"
          icon={detecting ? <Spin size="small" /> : <TbRefresh />}
          onClick={handleDetect}
          loading={detecting}
          className={styles.detectBtn}
        >
          {detecting ? "Detecting..." : "Detect Installed"}
        </Button>
      </div>
      <Collapse
        className={styles.bucketCollapse}
        defaultActiveKey={["core", "network"]}
        items={collapseItems}
      />
    </div>
  );
};

export default CapabilitiesPage;
