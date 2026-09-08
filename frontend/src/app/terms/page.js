import styles from "@/styles/pages/Terms.module.scss";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms and Conditions",
  description:
    "VektorSec Terms and Conditions — the legal terms for using the autonomous AI penetration testing and security operations platform.",
  path: "/terms",
});

export const revalidate = 300;

const TermsPage = () => {
  return (
    <div className={styles.termsContainer}>
      <h1>VektorSec Terms and Conditions</h1>
      <p>
        VektorSec (hereinafter referred to as &quot;Tool&quot;) is
        owned and operated by VektorSec Security Private Limited. The Tool is
        designed to provide cybersecurity professionals a platform for efficient
        ethical hacking and facilitate legal penetration testing. By using the
        Tool, you agree to abide by the terms and conditions set forth in this
        agreement as well as the main{" "}
        <a href="https://vektorsec.ai/terms">VektorSec Terms of Service</a> and{" "}
        <a href="https://vektorsec.ai/privacy">Privacy Policy</a>. If you do not
        agree to these terms, you should not use the Tool.
      </p>

      <ol>
        <li>
          <h2>Prohibited Uses</h2>
          <p>
            You are strictly prohibited from using the Tool to test any
            application, website, or other system for which you do not have
            explicit written permission to test. This includes, but is not
            limited to, any systems owned or operated by VektorSec or any third
            party. Misuse of the tool, such as running a crypto mining tool,
            operating a botnet, or targeting government websites, is strictly
            prohibited. Any such misuse will result in immediate termination of
            your access to the tool and may result in legal action. Violation of
            this policy may result in immediate termination of your access to
            the Tool and may lead to legal action by VektorSec or the relevant
            third party.
          </p>
        </li>

        <li>
          <h2>Indemnification</h2>
          <p>
            By using the Tool, you agree to indemnify and hold harmless VektorSec
            against any and all claims, damages, or legal actions resulting from
            your misuse of the environment. In the event that an ethical hacker
            misuses the product, the company reserves the right to take legal
            action directly against the ethical hacker. VektorSec will cooperate
            fully with any such legal action, including by sharing relevant
            details with the company. However, no damages can be claimed from
            VektorSec in relation to such misuse.
          </p>
        </li>

        <li>
          <h2>Tool</h2>
          <p>
            The Tool is provided &quot;as is&quot;, without warranty of any
            kind. VektorSec disclaims all warranties, express or implied,
            including but not limited to warranties of merchantability, fitness
            for a particular purpose, and non-infringement. In no event shall
            VektorSec be liable for any damages, including but not limited to
            direct, indirect, incidental, special, or consequential damages,
            arising out of or in connection with your use of the Tool.
          </p>
        </li>

        <li>
          <h2>Changes to these Terms</h2>
          <p>
            VektorSec reserves the right to modify these Terms of Service at any
            time. We will notify you of any changes by posting the new Terms of
            Service on this page. Your continued use of the Tool after any such
            changes constitutes your acceptance of the new Terms of Service.
          </p>
        </li>

        <li>
          <h2>Contact Us</h2>
          <p>
            If you have any questions about these Terms of Service, please
            contact us at <a href="mailto:hello@vektorsec.ai">hello@vektorsec.ai</a>.
          </p>
        </li>
      </ol>
    </div>
  );
};

export default TermsPage;
