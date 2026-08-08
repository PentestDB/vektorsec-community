"use client";

import React from "react";
import styles from "@/styles/components/Footer.module.scss";
import { MailOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { usePathname } from "next/navigation";


const loginRoutes = ["/dashboard", "/session", "/onboarding"];


const IntercommMessenger = () => {
  const pathname = usePathname()



  return (
    <>
      <>
        {
          !loginRoutes.includes(pathname) && (
            <a href="mailto:hello@vektorsec.ai">
              <Tooltip title="For any queries, reach out to us at hello@vektorsec.ai">
                <div className={styles.helperEmailContainer}>
                  <MailOutlined className={styles.mailIcon} />
                </div>
              </Tooltip>
            </a>
          )
        }

      </>
    </>
  );
};

export default IntercommMessenger;
