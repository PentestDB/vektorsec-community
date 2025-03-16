import styles from "@/styles/pages/Session.module.scss";

const LoopSidebar = ({ loops, onScroll }) => {
  return (
    <>
      {loops.length > 0 && (
        <div className={styles.sidebarWrapper}>
          {loops.map((loop, idx) => {
            return (
              <a
                key={loop.idx}
                className={styles.loop}
                onClick={() => onScroll(idx)}
              >
                Loop {idx + 1}
              </a>
            );
          })}
        </div>
      )}
    </>
  );
};

export default LoopSidebar;
