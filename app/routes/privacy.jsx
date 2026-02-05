import { json } from "@remix-run/node";

export const loader = async () => {
    return json({});
};

export default function PrivacyPolicy() {
    return (
        <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4", padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
            <h1>Privacy Policy</h1>
            <p>Last updated: February 05, 2026</p>

            <h2>1. Introduction</h2>
            <p>
                Bluepeaks Studio ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how our Shopify app "Variants Linked Products" collects, uses, and discloses your information.
            </p>

            <h2>2. Information We Collect</h2>
            <p>
                When you install our App, we are automatically able to access certain types of information from your Shopify account:
            </p>
            <ul>
                <li><strong>Shop Information:</strong> formatting, currency, and other settings.</li>
                <li><strong>Product Information:</strong> title, description, variants, and images (to provide the linking functionality).</li>
            </ul>
            <p>We do <strong>NOT</strong> collect or store any personal customer data (PII) such as customer names, emails, or shipping addresses.</p>

            <h2>3. How We Use Your Information</h2>
            <p>We use the information solely to provide the functionality of the App:</p>
            <ul>
                <li>To link separate products together as reliable variants using Metafields.</li>
                <li>To display swatches on your storefront.</li>
            </ul>

            <h2>4. Data Retention</h2>
            <p>The App uses Shopify's APIs and stores configuration data (Metafields) directly on your Shopify store resources. We store minimal configuration data necessary for the App to function.</p>

            <h2>5. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>

            <h2>6. Contact Us</h2>
            <p>
                If you have any questions about this Privacy Policy, please contact us at:<br />
                <strong>Email:</strong> support@bluepeaks.top
            </p>
        </div>
    );
}
