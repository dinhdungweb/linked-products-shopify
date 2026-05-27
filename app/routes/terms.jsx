import { json } from "@remix-run/node";

export const loader = async () => {
    return json({});
};

export default function TermsOfService() {
    return (
        <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4", padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
            <h1>Terms of Service</h1>
            <p>Last updated: February 05, 2026</p>

            <h2>1. Agreement to Terms</h2>
            <p>
                By installing and using the "Linkify: Product Variants" app ("the App"), provided by Bluepeaks Studio ("we", "us", or "our"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the App.
            </p>

            <h2>2. Use of the App</h2>
            <p>
                The App allows Shopify merchants to link products as variants using metafields. You agree to use the App only for lawful purposes and in accordance with these Terms and Shopify's Acceptable Use Policy.
            </p>

            <h2>3. Subscription and Billing</h2>
            <p>
                The App may offer premium features available via subscription. Billing is handled entirely through the Shopify Billing API. By selecting a paid plan, you agree to pay all applicable fees as presented to you during the upgrade process. Refunds and cancellations are governed by Shopify's App Store policies.
            </p>

            <h2>4. Disclaimer of Warranties</h2>
            <p>
                The App is provided on an "AS IS" and "AS AVAILABLE" basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property.
            </p>

            <h2>5. Limitation of Liability</h2>
            <p>
                In no event shall Bluepeaks Studio be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the App, even if we have been notified orally or in writing of the possibility of such damage.
            </p>

            <h2>6. Modifications to Terms</h2>
            <p>
                We reserve the right to modify these Terms at any time. We will notify you of any changes by updating the "Last updated" date of these Terms. Your continued use of the App following the posting of revised Terms means that you accept and agree to the changes.
            </p>

            <h2>7. Contact Information</h2>
            <p>
                If you have any questions about these Terms of Service, please contact us at:<br />
                <strong>Email:</strong> support@bluepeaks.top
            </p>
        </div>
    );
}
