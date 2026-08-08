import { useState, useMemo, useCallback } from "react";
import { Button, Tooltip, Input, Select } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  RobotOutlined,
  ClockCircleOutlined,
  SendOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  SearchOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import styles from "@/styles/components/CTF.module.scss";
import { formatDurationSec } from "@/utils/formatDuration";

const StatusBadge = ({ status, submittedToCtfd }) => {
  if (submittedToCtfd || status === "solved" || status === "submitted") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusSolved}`}>
        <CheckCircleFilled /> Solved
      </span>
    );
  }
  if (status === "flag_found") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusFound}`}>
        <RobotOutlined /> VektorSec found
      </span>
    );
  }
  if (status === "incorrect") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusIncorrect}`}>
        <CloseCircleFilled /> Incorrect
      </span>
    );
  }
  if (status === "solving") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusSolving}`}>
        <ClockCircleOutlined /> Solving
      </span>
    );
  }
  return (
    <span className={`${styles.statusBadge} ${styles.statusPending}`}>
      Pending
    </span>
  );
};

const ChallengeRow = ({
  challenge: ch,
  isActive,
  submitting,
  solveLoading,
  onSolve,
  onSubmit,
  onRowClick,
  extraActions,
}) => {
  const showSolveBtn = !(ch.status === "submitted" && ch.submittedToCtfd);

  return (
    <div
      className={`${styles.tableRow} ${isActive ? styles.tableRowActive : ""}`}
      onClick={onRowClick}
      style={onRowClick ? { cursor: "pointer" } : undefined}
    >
      <span className={styles.colName}>
        <span className={styles.challengeName}>{ch.name}</span>
      </span>
      <span className={styles.colCategory}>
        <span className={styles.categoryTag}>{ch.category}</span>
      </span>
      <span className={styles.colPoints}>{ch.value}</span>
      <span className={styles.colStatus}>
        <span className={styles.statusCell}>
          <StatusBadge status={ch.status} submittedToCtfd={ch.submittedToCtfd} />
          {ch.timeToSolveSec != null &&
            (ch.status === "solved" || ch.status === "submitted") && (
              <Tooltip title="Time from /solve until flag confirmed">
                <span className={styles.solveTime}>
                  {formatDurationSec(ch.timeToSolveSec)}
                </span>
              </Tooltip>
            )}
        </span>
      </span>
      <span className={styles.colFlag}>
        {ch.flag ? (
          <Tooltip title={ch.flag}>
            <code className={styles.flagValue}>{ch.flag}</code>
          </Tooltip>
        ) : (
          <span className={styles.noFlag}>—</span>
        )}
      </span>
      <span className={styles.colAction} onClick={(e) => e.stopPropagation()}>
        <span className={styles.actionStack}>
          {showSolveBtn && onSolve && (
            <Tooltip title="Focus on this challenge">
              <Button
                size="small"
                type="default"
                icon={solveLoading ? <LoadingOutlined /> : <PlayCircleOutlined />}
                loading={solveLoading}
                onClick={onSolve}
                className={styles.solveFocusBtn}
              >
                Solve
              </Button>
            </Tooltip>
          )}
          {ch.flag &&
            (ch.status === "flag_found" ||
              ch.status === "incorrect" ||
              ch.status === "solved" ||
              ch.status === "submitted" ||
              ch.submittedToCtfd) && (
              <Button
                size="small"
                type={ch.submittedToCtfd ? "default" : "primary"}
                icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
                loading={submitting}
                onClick={onSubmit}
                className={
                  ch.submittedToCtfd ? styles.resubmitBtn : styles.submitBtn
                }
              >
                {ch.submittedToCtfd ? "Re-submit" : "Submit"}
              </Button>
            )}
          {extraActions}
        </span>
      </span>
    </div>
  );
};

const ChallengeTable = ({
  challenges,
  activeSolveName,
  submittingFlag,
  solveNavigating,
  onSolve,
  onSubmit,
  onRowClick,
  renderExtraActions,
}) => {
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("default");

  const categoryOptions = useMemo(() => {
    const cats = Array.from(
      new Set(
        challenges
          .map((c) => String(c.category || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return cats;
  }, [challenges]);

  const filteredChallenges = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    const rankByStatus = (status, submittedToCtfd) => {
      if (submittedToCtfd || status === "solved" || status === "submitted") return 0;
      if (status === "flag_found") return 1;
      if (status === "incorrect") return 2;
      if (status === "solving") return 3;
      return 4;
    };

    let list = challenges.filter((c) => {
      if (search) {
        const name = String(c.name || "").toLowerCase();
        const cat = String(c.category || "").toLowerCase();
        if (!name.includes(search) && !cat.includes(search)) return false;
      }
      if (statusFilter !== "all") {
        const normalized =
          c.submittedToCtfd || c.status === "solved" || c.status === "submitted"
            ? "solved"
            : c.status;
        if (normalized !== statusFilter) return false;
      }
      if (categoryFilter !== "all") {
        if (String(c.category || "").toLowerCase() !== categoryFilter) return false;
      }
      return true;
    });

    if (sortBy === "name_asc") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "name_desc") {
      list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === "points_desc") {
      list = [...list].sort((a, b) => (b.value || 0) - (a.value || 0));
    } else if (sortBy === "points_asc") {
      list = [...list].sort((a, b) => (a.value || 0) - (b.value || 0));
    } else if (sortBy === "status") {
      list = [...list].sort((a, b) => {
        const byStatus = rankByStatus(a.status, a.submittedToCtfd) - rankByStatus(b.status, b.submittedToCtfd);
        if (byStatus !== 0) return byStatus;
        return a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [challenges, searchText, statusFilter, categoryFilter, sortBy]);

  const resetFilters = useCallback(() => {
    setSearchText("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSortBy("default");
  }, []);

  return (
    <>
      <div className={styles.challengeToolbar}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search challenge name or category"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className={styles.searchInput}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          className={styles.filterSelect}
          classNames={{ popup: { root: styles.filterDropdown } }}
          options={[
            { value: "all", label: "All status" },
            { value: "solving", label: "Solving" },
            { value: "flag_found", label: "VektorSec found" },
            { value: "incorrect", label: "Incorrect" },
            { value: "solved", label: "Solved" },
            { value: "pending", label: "Pending" },
          ]}
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          className={styles.filterSelect}
          classNames={{ popup: { root: styles.filterDropdown } }}
          options={[
            { value: "all", label: "All categories" },
            ...categoryOptions.map((cat) => ({
              value: cat.toLowerCase(),
              label: cat,
            })),
          ]}
        />
        <Select
          value={sortBy}
          onChange={setSortBy}
          className={styles.filterSelect}
          classNames={{ popup: { root: styles.filterDropdown } }}
          options={[
            { value: "default", label: "Default order" },
            { value: "status", label: "Status priority" },
            { value: "points_desc", label: "Points high → low" },
            { value: "points_asc", label: "Points low → high" },
            { value: "name_asc", label: "Name A → Z" },
            { value: "name_desc", label: "Name Z → A" },
          ]}
        />
        <Button
          icon={<FilterOutlined />}
          onClick={resetFilters}
          size="small"
          className={styles.resetFiltersBtn}
        >
          Reset
        </Button>
      </div>

      <div className={styles.filterSummary}>
        Showing {filteredChallenges.length} / {challenges.length} challenges
      </div>

      <div className={styles.challengeTable}>
        <div className={styles.challengeTableInner}>
          <div className={styles.tableHeader}>
            <span className={styles.colName}>Challenge</span>
            <span className={styles.colCategory}>Category</span>
            <span className={styles.colPoints}>Pts</span>
            <span className={styles.colStatus}>Status / time</span>
            <span className={styles.colFlag}>Flag</span>
            <span className={styles.colAction}>Actions</span>
          </div>
          {filteredChallenges.map((ch) => (
            <ChallengeRow
              key={ch.safeDir || ch.name}
              challenge={ch}
              isActive={activeSolveName === ch.name}
              submitting={submittingFlag === ch.name}
              solveLoading={solveNavigating === ch.name}
              onSolve={onSolve ? () => onSolve(ch) : undefined}
              onSubmit={() => onSubmit?.(ch)}
              onRowClick={onRowClick ? () => onRowClick(ch) : undefined}
              extraActions={renderExtraActions?.(ch)}
            />
          ))}
        </div>
      </div>

      {filteredChallenges.length === 0 && (
        <div className={styles.helpText}>
          No challenges match your current search/filters.
        </div>
      )}
    </>
  );
};

export default ChallengeTable;
export { StatusBadge, ChallengeRow };
