import {
  Badge,
  BlockStack,
  Box,
  Button,
  DropZone,
  Icon,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { ImportIcon, NoteIcon } from "@shopify/polaris-icons";

const CSV_HEADER = "Group Name,Option Name,Selector Style,Card Style,Status,Product Handles";
const CSV_EXAMPLE = "Summer Tees,Color,image_swatch,image_swatch_card,active,red-shirt,blue-shirt,green-shirt";

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    const value = size / 1024;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getLineCount(csvData) {
  return csvData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function CodeSample({ label, children }) {
  return (
    <BlockStack gap="150">
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <code style={{
        display: "block",
        padding: "10px 12px",
        borderRadius: "8px",
        backgroundColor: "#FFFFFF",
        border: "1px solid #E3E3E3",
        color: "#202223",
        fontSize: "12px",
        lineHeight: "18px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {children}
      </code>
    </BlockStack>
  );
}

export function ImportCsvModalContent({
  isImporting,
  file,
  csvData,
  onCsvDataChange,
  onDrop,
  onFileRemove,
}) {
  const lineCount = getLineCount(csvData || "");

  if (isImporting) {
    return (
      <Box padding="800">
        <BlockStack gap="400" align="center">
          <Spinner size="large" />
          <BlockStack gap="150" align="center">
            <Text variant="headingMd" as="h2">Importing product groups</Text>
            <Text variant="bodyMd" tone="subdued" alignment="center">
              We are creating groups, resolving product handles, and syncing storefront metafields.
            </Text>
          </BlockStack>
        </BlockStack>
      </Box>
    );
  }

  return (
    <BlockStack gap="500">
      <div style={{
        border: "1px solid #DDE3EA",
        borderRadius: "12px",
        backgroundColor: "#F7FAFC",
        padding: "16px",
      }}>
        <BlockStack gap="350">
          <InlineStack align="space-between" blockAlign="start" gap="300">
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">CSV template</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                One row creates one group. Use Shopify product handles, not product titles.
              </Text>
            </BlockStack>
            <Badge tone="info">2+ handles required</Badge>
          </InlineStack>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "12px",
          }}>
            <CodeSample label="Header row">{CSV_HEADER}</CodeSample>
            <CodeSample label="Example row">{CSV_EXAMPLE}</CodeSample>
          </div>
        </BlockStack>
      </div>

      <BlockStack gap="250">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text as="h3" variant="headingSm">Upload CSV file</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Choose an exported file or drag a CSV file into this area.
            </Text>
          </BlockStack>
          {file && <Badge tone="success">File selected</Badge>}
        </InlineStack>

        <DropZone onDrop={onDrop} allowMultiple={false} accept=".csv, text/csv">
          {file ? (
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                  <div style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    backgroundColor: "#F1F4F9",
                    color: "#2C6ECB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon source={NoteIcon} tone="inherit" />
                  </div>
                  <BlockStack gap="050">
                    <Text variant="bodyMd" fontWeight="semibold">{file.name}</Text>
                    <Text variant="bodySm" tone="subdued">
                      {formatFileSize(file.size)} loaded into the editor below.
                    </Text>
                  </BlockStack>
                </InlineStack>
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={(event) => {
                    event.stopPropagation();
                    onFileRemove();
                  }}
                >
                  Remove
                </Button>
              </InlineStack>
            </Box>
          ) : (
            <Box padding="600">
              <BlockStack gap="300" align="center">
                <div style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "12px",
                  backgroundColor: "#F1F4F9",
                  color: "#2C6ECB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Icon source={ImportIcon} tone="inherit" />
                </div>
                <BlockStack gap="100" align="center">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Drop your CSV file here</Text>
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    Or click to browse. Only CSV files are supported.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Box>
          )}
        </DropZone>
      </BlockStack>

      <BlockStack gap="250">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text as="h3" variant="headingSm">CSV data</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Paste or edit rows before importing.
            </Text>
          </BlockStack>
          <Badge tone={lineCount > 0 ? "success" : "subdued"}>
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </Badge>
        </InlineStack>
        <TextField
          label="CSV data"
          labelHidden
          value={csvData}
          onChange={onCsvDataChange}
          multiline={6}
          placeholder={`${CSV_HEADER}\n${CSV_EXAMPLE}`}
          autoComplete="off"
          helpText="Leave the header row in place when importing exported files."
        />
      </BlockStack>
    </BlockStack>
  );
}
