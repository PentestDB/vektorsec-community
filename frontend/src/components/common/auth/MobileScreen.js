import styles from "@/app/page.module.scss";
import Image from "next/image";
import laptop from "@/assets/laptop.svg";

const MobileScreen = () => {
  return (
    <div className={styles.mobileWrapper}>
      <Image src={laptop} alt="" draggable={false} width={300} height={300} />
      <h3>Get Optimal Experience with VektorSec</h3>
      <p>
        For the best user experience with VektorSec, we highly recommend
        accessing the platform on a laptop or desktop computer. Our interface is
        designed to take full advantage of larger screens and more powerful
        hardware, enabling you to efficiently conduct penetration testing
        activities with ease.
      </p>
    </div>
  );
};

export default MobileScreen;
