

import { Col } from "antd";
import { AiOutlineDoubleLeft } from "react-icons/ai";
import styles from "@/styles/pages/Session.module.scss";
import { RiAccountCircleLine } from "react-icons/ri";
import { PiChartDonutBold } from "react-icons/pi";
import { MdPayment } from "react-icons/md";
import { TiCloudStorageOutline } from "react-icons/ti";
import { TbTools, TbBrain, TbTerminal2 } from "react-icons/tb";
import { usePathname, useRouter } from "next/navigation";


const settingItems = [
    {
        name: "My Account",
        title: "My Account",
        path: "/settings",
        icon: <RiAccountCircleLine className={styles.sidebarIcon} />
    },
    {
        title: "Storage",
        name: "Storage",
        path: "/settings/storage",
        icon: <TiCloudStorageOutline className={styles.sidebarIcon} />
    },
    {
        title: "Capabilities",
        name: "Capabilities",
        path: "/settings/capabilities",
        icon: <TbTools className={styles.sidebarIcon} />
    },
    {
        title: "Models",
        name: "Models",
        path: "/settings/models",
        icon: <TbBrain className={styles.sidebarIcon} />
    },
    {
        title: "SSH / Exploit Box",
        name: "SSH",
        path: "/settings/ssh",
        icon: <TbTerminal2 className={styles.sidebarIcon} />
    }
];


const SettingsSidebar = () => {
    const pathname = usePathname()
    const router = useRouter()



    return (
        <Col span={4}>
            <div className={styles.sidebar}>
                <div className={styles.createNew}>
                    <div
                        className={styles.exitSessionSettings}
                        onClick={() => router.push("/dashboard")}
                    >
                        <AiOutlineDoubleLeft />
                        Back to Dashboard
                    </div>
                    <div className={styles.settingsHeader}>Settings</div>

                    <div className={styles.sessionOptions}>
                        {settingItems
                            .map((item, index) => (
                                <div
                                    key={index}
                                      onClick={() => router.push(item.path)}
                                    className={item.path === pathname ? styles.activeTab : styles.tab}
                                >
                                    {item.icon}
                                    {item.name}
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </Col>
    );
};

export default SettingsSidebar;
