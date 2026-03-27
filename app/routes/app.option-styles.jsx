import { useState, useCallback } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  Box,
  Divider,
  Icon,
  Button,
  Grid,
  Tabs,
  Select,
} from "@shopify/polaris";
import { LinkIcon, QuestionCircleIcon, PlusIcon, StoreIcon, MenuHorizontalIcon, ChevronDownIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

export default function OptionStylesPage() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const handleTabChange = useCallback((selectedTabIndex) => setSelectedTab(selectedTabIndex), []);
  const handleFilterChange = useCallback((value) => setSelectedFilter(value), []);

  const tabs = [
    { id: 'product-page', content: 'Product page', panelID: 'product-page-panel' },
    { id: 'product-card', content: 'Product card', panelID: 'product-card-panel' },
  ];

  const filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'In use', value: 'in_use' },
    { label: 'Not in use', value: 'not_in_use' },
  ];

  const images = [
    "https://images.unsplash.com/photo-1515347619362-73bc3ee01db1?w=400&q=80",
    "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=400&q=80",
    "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&q=80",
    "https://images.unsplash.com/photo-1502716115624-b56573c11516?w=400&q=80",
    "https://images.unsplash.com/photo-1434389674669-e08b4cac3105?w=400&q=80",
    "https://images.unsplash.com/photo-1485230895905-efec09beab9b?w=400&q=80"
  ];
  
  const colors = ['#f5f5dc', '#a020f0', '#ffa500', '#008000', '#ffb6c1', '#adff2f', '#ff0000', 'linear-gradient(45deg, #f06, #9f6)'];

  const renderStyleCard = (title, previewNode) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--p-color-bg-surface, #fff)', borderRadius: 'var(--p-border-radius-300, 8px)', boxShadow: 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05))', overflow: 'hidden' }}>
      <Box padding="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h3">{title}</Text>
            <Badge tone="new">Not in use</Badge>
          </InlineStack>
          <InlineStack gap="100" blockAlign="center">
            <Button icon={LinkIcon} size="micro">Customize</Button>
            <Button variant="plain" icon={MenuHorizontalIcon} accessibilityLabel="Actions" />
          </InlineStack>
        </InlineStack>
      </Box>
      <Divider />
      <div style={{ flex: 1, backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
         <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: '4px' }}>
           {previewNode}
         </div>
      </div>
    </div>
  );

  const renderExploreCard = (title, previewNode, asDarkCard = false) => {
    if (asDarkCard) {
      return (
        <div style={{ backgroundColor: '#4a4a4a', color: 'white', borderRadius: '8px', padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <Icon source={StoreIcon} tone="textInverse" />
          <Text variant="headingMd" tone="textInverse">Find more styles</Text>
          <Text variant="bodyMd" tone="textInverse">Discover more product page styles to fit your brand, including color swatch, image swatch, button, dropdown.</Text>
          <div style={{ marginTop: 'auto' }}>
            <Button>View all styles</Button>
          </div>
        </div>
      );
    }
    
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--p-color-bg-surface, #fff)', borderRadius: 'var(--p-border-radius-300, 8px)', boxShadow: 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05))', overflow: 'hidden' }}>
        <div style={{ flex: 1, backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
           <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowX: 'hidden' }}>
             {previewNode}
           </div>
        </div>
        <Divider />
        <Box padding="300">
          <InlineStack align="space-between" blockAlign="center">
             <Text variant="headingSm" as="h3">{title}</Text>
             <Button icon={PlusIcon} size="micro">Add</Button>
          </InlineStack>
        </Box>
      </div>
    );
  };

  // --- PREVIEW NODES ---
  const imageSwatchPreview = (
    <InlineStack gap="200" wrap={false}>
      {images.map((img, i) => (
        <div key={i} style={{ width: '48px', height: '48px', flexShrink: 0, border: i === 1 ? '2px solid #000' : '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ))}
    </InlineStack>
  );

  const slideSwatchPreview = (
    <InlineStack gap="200" wrap={false}>
      {['Beige Brown', 'Black White', 'Red Rose', 'Teal Lily'].map((name, i) => (
        <div key={i} style={{ width: '70px', flexShrink: 0, border: i === 1 ? '2px solid #000' : '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '80px', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={images[i]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ padding: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{name}</div>
            <div style={{ fontSize: '10px', color: '#666' }}>$15.99</div>
          </div>
        </div>
      ))}
    </InlineStack>
  );

  const polaroidSwatchPreview = (
    <InlineStack gap="200" wrap={false}>
      {images.map((img, i) => (
        <div key={i} style={{ padding: '4px', backgroundColor: '#fff', border: i === 1 ? '2px solid #000' : '1px solid #ccc', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ width: '40px', height: '48px', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={img} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        </div>
      ))}
    </InlineStack>
  );

  const colorSwatchPreview = (
    <InlineStack gap="200" align="start">
      {colors.map((color, i) => (
        <div key={i} style={{ 
          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
          background: color, 
          border: '2px solid #fff', 
          outline: i === 1 ? '2px solid #5c6ac4' : '1px solid #ddd',
          outlineOffset: '2px'
        }} />
      ))}
    </InlineStack>
  );

  const squareColorSwatchPreview = (
    <InlineStack gap="200" align="start">
      {colors.map((color, i) => (
        <div key={i} style={{ 
          width: '32px', height: '32px', borderRadius: '4px', flexShrink: 0,
          background: color, 
          border: '2px solid #fff', 
          outline: i === 1 ? '2px solid #5c6ac4' : '1px solid #ddd',
          outlineOffset: '2px'
        }} />
      ))}
    </InlineStack>
  );

  const colorPillPreview = (
    <InlineStack gap="200" wrap={false}>
      {['Beige', 'Purple', 'Orange', 'Green'].map((text, i) => (
        <div key={i} style={{ 
          display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', flexShrink: 0,
          borderRadius: '20px', backgroundColor: '#fff',
          border: i === 1 ? '2px solid #000' : '1px solid #ccc'
        }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: colors[i] }} />
          <span style={{ fontSize: '12px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{text}</span>
        </div>
      ))}
    </InlineStack>
  );

  const buttonPreview = (
    <InlineStack gap="200" wrap={false}>
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Beige</div>
      <div style={{ padding: '8px 16px', border: '2px solid #000', backgroundColor: '#000', color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>Dark blue</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Green</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ddd', backgroundColor: '#fff', color: '#999', fontSize: '13px', textDecoration: 'line-through' }}>Yellow</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Black</div>
    </InlineStack>
  );

  const pillButtonPreview = (
    <InlineStack gap="200" wrap={false}>
      <div style={{ padding: '6px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px', borderRadius: '20px' }}>Beige</div>
      <div style={{ padding: '6px 16px', border: '2px solid #000', backgroundColor: '#000', color: '#fff', fontSize: '13px', fontWeight: 'bold', borderRadius: '20px' }}>Dark blue</div>
      <div style={{ padding: '6px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px', borderRadius: '20px' }}>Green</div>
      <div style={{ padding: '6px 16px', border: '1px solid #ddd', backgroundColor: '#fff', color: '#999', fontSize: '13px', textDecoration: 'line-through', borderRadius: '20px' }}>Yellow</div>
      <div style={{ padding: '6px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px', borderRadius: '20px' }}>Black</div>
    </InlineStack>
  );

  const dropdownPreview = (
    <div style={{ width: '100%', maxWidth: '300px', padding: '10px 14px', border: '1px solid #8c9196', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
      <span style={{ fontSize: '14px' }}>Beige Brown</span>
      <Icon source={ChevronDownIcon} tone="base" />
    </div>
  );

  const imageDropdownPreview = (
    <div style={{ width: '100%', maxWidth: '300px', padding: '6px 14px', border: '1px solid #8c9196', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src={images[0]} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
        <span style={{ fontSize: '14px' }}>Beige Brown</span>
      </div>
      <Icon source={ChevronDownIcon} tone="base" />
    </div>
  );

  const imageSwatchCardPreview = (
    <InlineStack gap="200" wrap={false} align="center" blockAlign="center">
      {['Beige Brown', 'Black White', 'Red Rose'].map((name, i) => (
        <div key={i} style={{ padding: '8px', border: i === 1 ? '1px solid #000' : '1px solid #ccc', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={images[i]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{name}</div>
            <div style={{ fontSize: '10px', color: '#666' }}>$12.88</div>
          </div>
        </div>
      ))}
    </InlineStack>
  );

  const colorSwatchCardPreview = (
    <InlineStack gap="200" wrap={false} align="center" blockAlign="center">
      {['Beige', 'Purple', 'Orange', 'Green'].map((name, i) => (
        <div key={i} style={{ padding: '8px', border: i === 1 ? '1px solid #000' : '1px solid #ccc', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: colors[i] }} />
          <div style={{ fontSize: '10px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{name}</div>
        </div>
      ))}
    </InlineStack>
  );

  return (
    <Page fullWidth>
      <TitleBar title="Option styles" />
      
      <BlockStack gap="600">
        {/* Header Section */}
        <BlockStack gap="200">
           <Text variant="headingXl">Option styles</Text>
           <Text variant="bodyMd" tone="subdued">Customize your product page and product card options.</Text>
        </BlockStack>

        <Box paddingBlockEnd="200">
           <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
           <Divider />
        </Box>

        {/* My Styles Section */}
        <BlockStack gap="400">
           <InlineStack align="space-between" blockAlign="start">
             <BlockStack gap="100">
                <Text variant="headingLg">My styles</Text>
                <Text variant="bodyMd" tone="subdued">Manage and customize your option styles on your product page.</Text>
             </BlockStack>
             <div style={{ width: '120px' }}>
                <Select
                  options={filterOptions}
                  onChange={handleFilterChange}
                  value={selectedFilter}
                />
             </div>
           </InlineStack>

           <Grid>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Image swatch", imageSwatchPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Slide swatch (Mobile only)", slideSwatchPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Polaroid swatch", polaroidSwatchPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Color swatch", colorSwatchPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Square color swatch", squareColorSwatchPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Color swatch in pill button", colorPillPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Button", buttonPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Pill button", pillButtonPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Dropdown", dropdownPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
               {renderStyleCard("Image swatch in dropdown", imageDropdownPreview)}
             </Grid.Cell>
           </Grid>
        </BlockStack>

        <Box paddingBlockStart="200" paddingBlockEnd="200">
           <Divider />
        </Box>

        {/* Explore More Styles Section */}
        <BlockStack gap="400">
           <BlockStack gap="100">
              <Text variant="headingLg">Explore more styles</Text>
              <Text variant="bodyMd" tone="subdued">Discover more product page styles to fit your brand.</Text>
           </BlockStack>

           <Grid>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
               {renderExploreCard("Slide swatch (Mobile only)", slideSwatchPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
               {renderExploreCard("Image swatch card", imageSwatchCardPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
               {renderExploreCard("Polaroid swatch", polaroidSwatchPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
               {renderExploreCard("Color swatch card", colorSwatchCardPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
               {renderExploreCard("Button", buttonPreview)}
             </Grid.Cell>
             <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
               {renderExploreCard("Find more styles", null, true)}
             </Grid.Cell>
           </Grid>
        </BlockStack>

        {/* Footer */}
        <Box paddingBlockEnd="600" paddingBlockStart="400">
           <InlineStack align="center" gap="100">
             <Icon source={QuestionCircleIcon} tone="base" />
             <a href="#" style={{ textDecoration: 'none', color: '#005bd3', fontWeight: '500' }}>Help Center</a>
           </InlineStack>
        </Box>
      </BlockStack>
    </Page>
  );
}
