import Loader from "@/components/common/loader/Loader";
import { getUserTools, toolPreferenceUpdate } from "@/services/user.service";
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Tools.module.scss";
import { Checkbox, Col, Form, App, Row } from "antd";
import { debounce } from "lodash";
import { FiExternalLink } from "react-icons/fi";
import { useMutation, useQuery } from "react-query";

const ToolsPage = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = useQuery("user-tools", getUserTools);

  const updateToolsMutation = useMutation(toolPreferenceUpdate, {
    onSuccess: (data) => {
      message.success(t("toolsSettings.updated"));
    },
    onError: (error) => {
      console.log(error);
    },
  });

  const onFormSubmit = async (_, allValues) => {
    const tools = Object.values(allValues).flat();
    const debouncedUpdateTools = debounce(updateToolsMutation.mutateAsync, 500);
    debouncedUpdateTools({ tools });
  };

  const findInitialValue = () => {
    const initialTools = data?.tools;

    const tools1 = initialTools?.filter((item) =>
      bruteforcing.map((tool) => tool.value).includes(item)
    );

    const tools2 = initialTools?.filter((item) =>
      subdomianPassive.map((tool) => tool.value).includes(item)
    );

    const tools3 = initialTools?.filter((item) =>
      subdomainBruteforce.map((tool) => tool.value).includes(item)
    );

    const tools4 = initialTools?.filter((item) =>
      credBruteforce.map((tool) => tool.value).includes(item)
    );

    const tools5 = initialTools?.filter((item) =>
      portScanning.map((tool) => tool.value).includes(item)
    );

    const tools6 = initialTools?.filter((item) =>
      cmsScanner.map((tool) => tool.value).includes(item)
    );

    const tools7 = initialTools?.filter((item) =>
      spiderCrawling.map((tool) => tool.value).includes(item)
    );

    const tools8 = initialTools?.filter((item) =>
      fingerPrinting.map((tool) => tool.value).includes(item)
    );

    const tools9 = initialTools?.filter((item) =>
      vulnExploitation.map((tool) => tool.value).includes(item)
    );

    return {
      tools1,
      tools2,
      tools3,
      tools4,
      tools5,
      tools6,
      tools7,
      tools8,
      tools9,
    };
  };

  if (isLoading) {
    return <Loader />;
  }

  return (
    <Form
      layout="vertical"
      initialValues={{
        tools1: findInitialValue().tools1,
        tools2: findInitialValue().tools2,
        tools3: findInitialValue().tools3,
        tools4: findInitialValue().tools4,
        tools5: findInitialValue().tools5,
        tools6: findInitialValue().tools6,
        tools7: findInitialValue().tools7,
        tools8: findInitialValue().tools8,
        tools9: findInitialValue().tools9,
      }}
      onValuesChange={debounce(onFormSubmit)}
    >
      <Row className={styles.toolsContainer} gutter={[32, 16]}>
        <Col className={styles.leftToolBox} lg={12} xl={12} md={24} sm={24}>
          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.directoryBruteforcing")}</h2>
            <Form.Item name="tools1">
              <Checkbox.Group>
                {bruteforcing.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>

          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.subdomainPassive")}</h2>
            <Form.Item name="tools2">
              <Checkbox.Group>
                {subdomianPassive.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>

          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.subdomainBruteforcing")}</h2>
            <Form.Item name="tools3">
              <Checkbox.Group>
                {subdomainBruteforce.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>

          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.credentialBruteforcing")}</h2>
            <Form.Item name="tools4">
              <Checkbox.Group>
                {credBruteforce.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>

          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.cmsScanners")}</h2>
            <Form.Item name="tools6">
              <Checkbox.Group>
                {cmsScanner.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>
        </Col>

        <Col className={styles.rightToolBox} lg={12} xl={12} md={24} sm={24}>
          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.portScanning")}</h2>
            <Form.Item name="tools5">
              <Checkbox.Group>
                {portScanning.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>

          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.spiderCrawling")}</h2>
            <Form.Item name="tools7">
              <Checkbox.Group>
                {spiderCrawling.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>

          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.fingerprinting")}</h2>
            <Form.Item name="tools8">
              <Checkbox.Group>
                {fingerPrinting.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>

          <div className={styles.selectToolBox}>
            <h2>{t("toolsSettings.vulnExploitation")}</h2>
            <Form.Item name="tools9">
              <Checkbox.Group className={styles.lastToolChild}>
                {vulnExploitation.map((item, index) => {
                  return (
                    <div key={index} className={styles.checkboxItem}>
                      <Checkbox key={index} value={item.value}>
                        {item.label}
                      </Checkbox>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        <FiExternalLink />
                      </a>
                    </div>
                  );
                })}
              </Checkbox.Group>
            </Form.Item>
          </div>
        </Col>
      </Row>
    </Form>
  );
};

export default ToolsPage;

const bruteforcing = [
  {
    label: "ffuf",
    value: "ffuf",
    link: "https://github.com/ffuf/ffuf",
  },
  {
    label: "feroxbuster",
    value: "feroxbuster",
    link: "https://github.com/epi052/feroxbuster",
  },
  {
    label: "dirsearch",
    value: "dirsearch",
    link: "https://github.com/maurosoria/dirsearch",
  },
  {
    label: "wfuzz",
    value: "wfuzz",
    link: "https://github.com/xmendez/wfuzz",
  },
  {
    label: "gobuster",
    value: "gobuster",
    link: "https://github.com/OJ/gobuster",
  },
];

const subdomianPassive = [
  {
    label: "Subfinder",
    value: "subfinder",
    link: "https://github.com/projectdiscovery/subfinder",
  },
  {
    label: "Amass",
    value: "amass",
    link: "https://github.com/owasp-amass/amass",
  },
  {
    label: "Findomain",
    value: "findomain",
    link: "https://github.com/Findomain/Findomain",
  },
  {
    label: "assetfinder",
    value: "assetfinder",
    link: "https://github.com/tomnomnom/assetfinder",
  },
];

const subdomainBruteforce = [
  {
    label: "shuffledns",
    value: "shuffledns",
    link: "https://github.com/projectdiscovery/shuffledns",
  },
  {
    label: "puredns",
    value: "puredns",
    link: "https://github.com/d3mondev/puredns",
  },
  {
    label: "dnsx",
    value: "dnsx",
    link: "https://github.com/projectdiscovery/dnsx",
  },
];

const credBruteforce = [
  {
    label: "THC-Hydra",
    value: "hydra",
    link: "https://www.kali.org/tools/hydra/",
  },
  {
    label: "patator",
    value: "patator",
    link: "https://github.com/lanjelot/patator",
  },
  {
    label: "crowbar",
    value: "crowbar",
    link: "https://github.com/galkan/crowbar",
  },
];

const portScanning = [
  {
    label: "Nmap",
    value: "nmap",
    link: "https://nmap.org/",
  },
  {
    label: "naabu",
    value: "naabu",
    link: "https://github.com/projectdiscovery/naabu",
  },
  {
    label: "Smap",
    value: "smap",
    link: "https://github.com/s0md3v/Smap",
  },
  {
    label: "Masscan",
    value: "masscan",
    link: "https://github.com/robertdavidgraham/masscan",
  },
];

const cmsScanner = [
  {
    label: "Wpscan",
    value: "wpscan",
    link: "https://github.com/wpscanteam/wpscan",
  },
  // {
  //   label: "joomscan",
  //   value: "joomscan",
  //   link: "https://github.com/OWASP/joomscan",
  // },
  {
    label: "drupwn",
    value: "drupwn",
    link: "https://github.com/immunIT/drupwn",
  },
  {
    label: "CMSmap",
    value: "cmsmap",
    link: "https://github.com/dionach/CMSmap",
  },
];

const spiderCrawling = [
  {
    label: "WayBackURLs",
    value: "waybackurls",
    link: "https://github.com/tomnomnom/waybackurls",
  },
  {
    label: "Gau",
    value: "gau",
    link: "https://github.com/lc/gau",
  },
  {
    label: "xnlLinkFinder",
    value: "xnlLinkfinder",
    link: "https://github.com/xnl-h4ck3r/xnLinkFinder",
  },
  {
    label: "waymore",
    value: "waymore",
    link: "https://github.com/xnl-h4ck3r/waymore",
  },
  {
    label: "Katana",
    value: "katana",
    link: " https://github.com/projectdiscovery/katana",
  },
  {
    label: "Gospider",
    value: "gospider",
    link: "https://github.com/jaeles-project/gospider",
  },
];

const fingerPrinting = [
  {
    label: "Whatsweb",
    value: "whatsweb",
    link: "https://github.com/urbanadventurer/WhatWeb",
  },
  {
    label: "httpx",
    value: "httpx",
    link: "https://github.com/projectdiscovery/httpx",
  },
];

const vulnExploitation = [
  {
    label: "sqlmap",
    value: "sqlmap",
    link: "https://github.com/sqlmapproject/sqlmap",
  },
  {
    label: "ghauri",
    value: "ghauri",
    link: "https://github.com/r0oth3x49/ghauri.git",
  },
  {
    label: "GraphQLmap",
    value: "graphqlmap",
    link: "https://github.com/swisskyrepo/GraphQLmap",
  },
  // {
  //   label: "clairvoyance",
  //   value: "clairvoyance",
  //   link: "https://github.com/nikitastupin/clairvoyance",
  // },
  // {
  //   label: "NoSQLMap",
  //   value: "nosqlmap",
  //   link: "https://github.com/codingo/NoSQLMap",
  // },
  {
    label: "dalfox",
    value: "dalfox",
    link: "https://github.com/hahwul/dalfox",
  },
  {
    label: "SecretFinder",
    value: "secretfinder",
    link: "https://github.com/m4ll0k/SecretFinder",
  },
  {
    label: "Confused",
    value: "confused",
    link: "https://github.com/visma-prodsec/confused",
  },
];
