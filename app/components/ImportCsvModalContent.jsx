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
} from "@shopify/polaris";
import { ImportIcon, NoteIcon } from "@shopify/polaris-icons";

const SAMPLE_CSV = [
  "Group Name,Option Name,Selector Style,Card Style,Status,Product Handles",
  "Summer Tees,Color,image_swatch,image_swatch_card,active,red-shirt,blue-shirt,green-shirt",
].join("\n");

const SAMPLE_CSV_URL = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    const value = size / 1024;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getDataLines(csvData) {
  const lines = (csvData || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const hasHeader = lines[0].toLowerCase().includes("group name") ||
    lines[0].toLowerCase().includes("option name");

  return hasHeader ? lines.slice(1) : lines;
}

function buildPreviewRows(csvData) {
  const lines = (csvData || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const hasHeader = lines[0].toLowerCase().includes("group name") ||
    lines[0].toLowerCase().includes("option name");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.slice(0, 5).map((line, index) => {
    const parts = line.split(",").map((part) => part.trim()).filter(Boolean);

    if (hasHeader) {
      return {
        id: `${index}-${line}`,
        groupName: parts[0] || "Untitled Group",
        optionName: parts[1] || "Color",
        status: parts[4] || "active",
        handles: parts.slice(5),
      };
    }

    return {
      id: `${index}-${line}`,
      groupName: parts[0] || "Untitled Group",
      optionName: "Color",
      status: "active",
      handles: parts.slice(1),
    };
  });
}

export function ImportCsvModalContent({
  isImporting,
  file,
  csvData,
  showPreview = false,
  onDrop,
  onFileRemove,
}) {
  const dataLines = getDataLines(csvData);
  const previewRows = buildPreviewRows(csvData);
  const hiddenRows = Math.max(0, dataLines.length - previewRows.length);

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

  if (showPreview) {
    return (
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text as="h3" variant="headingSm">Preview import</Text>
            {file && (
              <Text as="p" variant="bodySm" tone="subdued">
                {file.name} - {formatFileSize(file.size)}
              </Text>
            )}
          </BlockStack>
          <Badge tone={dataLines.length > 0 ? "success" : "subdued"}>
            {dataLines.length} {dataLines.length === 1 ? "group" : "groups"}
          </Badge>
        </InlineStack>

        <div style={{
          border: "1px solid #E3E3E3",
          borderRadius: "10px",
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
        }}>
          {previewRows.length > 0 ? (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(160px, 1.2fr) minmax(90px, 0.7fr) minmax(90px, 0.6fr) minmax(160px, 1fr)",
                gap: "12px",
                padding: "10px 12px",
                backgroundColor: "#F7F7F7",
                borderBottom: "1px solid #E3E3E3",
              }}>
                <Text as="p" variant="bodySm" fontWeight="semibold">Group</Text>
                <Text as="p" variant="bodySm" fontWeight="semibold">Option</Text>
                <Text as="p" variant="bodySm" fontWeight="semibold">Status</Text>
                <Text as="p" variant="bodySm" fontWeight="semibold">Products</Text>
              </div>
              {previewRows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(160px, 1.2fr) minmax(90px, 0.7fr) minmax(90px, 0.6fr) minmax(160px, 1fr)",
                    gap: "12px",
                    padding: "12px",
                    borderBottom: "1px solid #F1F1F1",
                    alignItems: "center",
                  }}
                >
                  <Text as="p" variant="bodyMd" fontWeight="semibold" truncate>{row.groupName}</Text>
                  <Text as="p" variant="bodySm" tone="subdued" truncate>{row.optionName}</Text>
                  <Badge tone={row.status === "active" ? "success" : "subdued"}>{row.status}</Badge>
                  <Text as="p" variant="bodySm" tone="subdued" truncate>
                    {row.handles.length > 0
                      ? `${row.handles.slice(0, 3).join(", ")}${row.handles.length > 3 ? ` +${row.handles.length - 3}` : ""}`
                      : "No handles"}
                  </Text>
                </div>
              ))}
              {hiddenRows > 0 && (
                <Box padding="300" background="bg-surface-secondary">
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    Showing first 5 groups. {hiddenRows} more will be imported.
                  </Text>
                </Box>
              )}
            </>
          ) : (
            <Box padding="800">
              <BlockStack gap="200" align="center">
                <Text as="p" variant="bodyMd" fontWeight="semibold">No preview yet</Text>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  Upload a CSV file to preview product groups before importing.
                </Text>
              </BlockStack>
            </Box>
          )}
        </div>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="500">
      <DropZone onDrop={onDrop} allowMultiple={false} accept=".csv, text/csv">
        <Box padding="600">
          <div style={{
            minHeight: "120px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            {file ? (
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
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{file.name}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {formatFileSize(file.size)} selected
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
            ) : (
              <BlockStack gap="300" align="center">
                <Button icon={ImportIcon}>Add file</Button>
              </BlockStack>
            )}
          </div>
        </Box>
      </DropZone>

      <a
        href={SAMPLE_CSV_URL}
        download="linked-product-groups-sample.csv"
        style={{
          color: "#005BD3",
          textDecoration: "none",
          fontSize: "13px",
          width: "fit-content",
        }}
      >
        Download sample CSV
      </a>
    </BlockStack>
  );
}
