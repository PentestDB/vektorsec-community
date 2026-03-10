import { Col } from "antd";
import { AiOutlineDoubleLeft } from "react-icons/ai";
import styles from "@/styles/pages/Session.module.scss";
import { RiAccountCircleLine } from "react-icons/ri";
import { TbTools, TbBrain, TbTerminal2, TbDeviceDesktop, TbWorldWww, TbPlugConnected } from "react-icons/tb";
import { usePathname, useRouter } from "next/navigation";

const settingItems = [
    {
        name: "My Account",
        title: "My Account",
        path: "/settings",
        icon: <RiAccountCircleLine className={styles.sidebarIcon} />
    },
    {
        title: "Agent Tools",
        name: "Agent Tools",
        path: "/settings/agent-tools",
        icon: <TbPlugConnected className={styles.sidebarIcon} />
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
    },
    {
        title: "GUI / VNC",
        name: "GUI",
        path: "/settings/gui",
        icon: <TbDeviceDesktop className={styles.sidebarIcon} />
    },
    {
        title: "Browser Agent",
        name: "Browser Agent",
        path: "/settings/magnitude",
        icon: <TbWorldWww className={styles.sidebarIcon} />
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
