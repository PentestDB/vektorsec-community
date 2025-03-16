import styles from "@/styles/components/Carousel.module.scss";
import Image from "next/image";
import { useEffect } from "react";

const Carousel = ({ images, activeIndex, setActiveIndex }) => {
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeIndex === images.length - 1) {
        setActiveIndex(0);
      } else {
        setActiveIndex((prevIndex) => prevIndex + 1);
      }
    }, 6000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  return (
    <div className={styles.mainCarouselWrap}>
      {images.map((image, index) => (
        <div
          key={index}
          className={
            activeIndex === index
              ? styles.imageContainerActive
              : styles.imageContainer
          }
        >
          <Image
            draggable={false}
            src={image}
            alt="carousel-image"
            style={{
              maxWidth: "100%",
            }}
          />
        </div>
      ))}

      <div className={styles.carouselIndicator}>
        {images.map((_, index) => (
          <div
            key={index}
            className={
              activeIndex === index ? styles.indicatorActive : styles.indicator
            }
            onClick={() => setActiveIndex(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default Carousel;
