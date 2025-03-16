import styles from "@/styles/components/Carousel.module.scss";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useEffect } from "react";

const Slider = ({
  slides,
  activeSlide,
  setActiveSlide,
  autoplay = true,
  duration = 4000,
}) => {
  const [activeClass, setActiveClass] = useState(styles.activeSlideOut);

  const onPrevSlide = () => {
    setActiveClass(styles.activeSlideIn);
    if (activeSlide !== 0) {
      setActiveSlide(activeSlide - 1);
    } else {
      setActiveSlide(slides.length - 1);
    }
  };

  const onNextSlide = () => {
    setActiveClass(styles.activeSlideOut);
    if (activeSlide !== slides.length - 1) {
      setActiveSlide(activeSlide + 1);
    } else {
      setActiveSlide(0);
    }
  };

  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      setActiveClass(styles.activeSlideOut);
      setActiveSlide(activeSlide !== slides.length - 1 ? activeSlide + 1 : 0);
    }, duration);

    return () => clearTimeout(timer);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlide]);

  return (
    <div className={styles.sliderWrapper}>
      <div className={styles.leftArrow} onClick={onPrevSlide}>
        <LeftOutlined />
      </div>
      {slides.map((slide, index) => (
        <div
          key={index}
          className={activeSlide === index ? activeClass : styles.slide}
        >
          {slide}
        </div>
      ))}
      <div className={styles.rightArrow} onClick={onNextSlide}>
        <RightOutlined />
      </div>
    </div>
  );
};

export default Slider;
