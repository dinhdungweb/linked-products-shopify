const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'extensions', 'linked-products', 'assets', 'linked-products.css');
let content = fs.readFileSync(filePath, 'utf8');

// I will rewrite the entire Slide and Slide-Mobile sections to be clean
const cleanStyles = `
/* Slide: always horizontal scroll at all screen sizes */
.linked-products-picker .variant-picker__option-values.is-slide {
  display: flex !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
}

.linked-products-picker .variant-picker__option-values.is-slide::-webkit-scrollbar {
  display: none;
}

.linked-products-picker .variant-picker__option-values.is-slide > * {
  display: inline-flex !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  float: none !important;
  vertical-align: top;
  scroll-snap-align: start;
}

/* Slide Mobile Only: slide on mobile, wrap on desktop */
.linked-products-picker .variant-picker__option-values.is-slide-mobile {
  display: flex !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
}

.linked-products-picker .variant-picker__option-values.is-slide-mobile::-webkit-scrollbar {
  display: none;
}

@media screen and (max-width: 749px) {
  .linked-products-picker .variant-picker__option-values.is-slide-mobile {
    scroll-snap-type: x mandatory;
  }
  .linked-products-picker .variant-picker__option-values.is-slide-mobile > * {
    display: inline-flex !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    float: none !important;
    vertical-align: top;
    scroll-snap-align: start;
  }
}
`;

// Extract the header part (before our target styles)
const headPattern = /.*\.lp-swatches-container \{[^}]+\}/s;
const headMatch = content.match(headPattern);

if (headMatch) {
    // Find everything after the header and before the next major section (if any)
    // Actually, I'll just replace from where the Slide styles usually start
    const startTag = '/* Slide: always horizontal scroll at all screen sizes */';
    const startIndex = content.indexOf(startTag);
    
    // Find the end of the mobile section
    const endTag = '/* Variant Picker Options */'; // I'll assume this or similar follows
    let endIndex = content.indexOf(endTag);
    if (endIndex === -1) endIndex = content.length;

    const newContent = content.substring(0, startIndex) + cleanStyles + content.substring(endIndex);
    fs.writeFileSync(filePath, newContent);
    console.log('CSS cleaned and updated successfully');
} else {
    console.error('Could not find CSS markers');
}
