import React from 'react';
import { InlineStack, Text, Icon, Badge } from "@shopify/polaris";
import { ChevronDownIcon } from "@shopify/polaris-icons";

export const IMAGES = [
  "https://picsum.photos/id/1027/400/500",
  "https://picsum.photos/id/1011/400/500",
  "https://picsum.photos/id/1059/400/500",
  "https://picsum.photos/id/1074/400/500",
  "https://picsum.photos/id/1084/400/500",
  "https://picsum.photos/id/1069/400/500",
  "https://picsum.photos/id/1062/400/500",
  "https://picsum.photos/id/1012/400/500"
];

export const COLORS = ['#f5f5dc', '#a020f0', '#ffa500', '#008000', '#ffb6c1', '#adff2f', '#ff0000', 'linear-gradient(45deg, #f06, #9f6)'];

export const PREVIEW_PRODUCTS = [
  { name: 'Beige Brown', color: IMAGES[0], colorHex: '#f5f5dc', style: 'one', price: '$12.88' },
  { name: 'Black White', color: IMAGES[1], colorHex: '#a020f0', style: 'two', colorHex2: '#000000', price: '$15.99' },
  { name: 'Red Rose', color: IMAGES[2], colorHex: '#ff0000', style: 'one', price: '$19.99' },
  { name: 'Teal Lily', color: IMAGES[3], colorHex: '#008080', style: 'one', price: '$24.99' },
  { name: 'Yellow Bloom', color: IMAGES[4], colorHex: '#ffff00', style: 'one', price: '$18.50' },
  { name: 'Purple Mini', color: IMAGES[5], colorHex: '#800080', style: 'one', price: '$22.00' }
];

export const BASE_SETTINGS = {
  basic: { swatchSize: 32, gap: 10, hideActiveSwatch: false, activeSwatchFirst: false, padding: 0, twoColorStyle: "LT_RB", hoverEffect: "none", aspectRatio: "1:1", imagePosition: "center" },
  border: { radius: 4, width: 1, color: "#dbdfe2", activeColor: "#000000", hoverColor: "#000000", outerWidth: 0, outerRadius: 4, outerPadding: 4, outerColor: "#dbdfe2", outerActiveColor: "#000000", outerHoverColor: "#000000" },
  label: { show: true, layout: "stack", gap: 8, fontSize: 14, fontWeight: "normal", lineHeight: 18, showSelectedVariant: true, selectedVariantFontWeight: "normal" },
  variantName: { show: true, fontSize: 12, fontWeight: "semibold", maxLines: 1 },
  price: { show: false, fontSize: 10, fontWeight: "normal", color: "#6d7175" },
  text: { position: "right", gap: 8, width: 50 },
  layout: { marginTop: 0, marginBottom: 10, align: "left", type: "stack", maxSwatches: 100 },
  unavailable: { style: "cross_mark", allowRedirect: false, hideUnmatched: false },
  badge: { show: false, text: "NEW", position: "top-right", fontSize: 10, color: "#ffffff", bgColor: "#000000" },
  shadow: { show: false, color: "rgba(0,0,0,0.1)", blur: 4, spread: 0, offsetX: 0, offsetY: 2 },
};

export const DEFAULT_SETTINGS_BY_STYLE = {
  image_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 48, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 100 }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  slide_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 90, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0, width: 1, color: "#ccc", activeColor: "#000", outerWidth: 0 }, layout: { ...BASE_SETTINGS.layout, type: 'slide' } },
  polaroid_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 52, padding: 4, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0 }, shadow: { ...BASE_SETTINGS.shadow, show: true, color: "rgba(0,0,0,0.1)", blur: 3, offsetY: 1 }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  color_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 32, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20, width: 2, color: "#ffffff", activeColor: "#ffffff", outerWidth: 2, outerPadding: 2, outerActiveColor: "#5c6ac4", outerRadius: 20, outerColor: "#dddddd" }, label: { ...BASE_SETTINGS.label, show: false }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  square_color_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 32, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 4, width: 2, color: "#ffffff", activeColor: "#ffffff", outerWidth: 2, outerPadding: 2, outerActiveColor: "#5c6ac4", outerRadius: 6, outerColor: "#dddddd" }, label: { ...BASE_SETTINGS.label, show: false }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  pill_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 6, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20 } },
  button: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 8, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0 }, label: { ...BASE_SETTINGS.label, show: false } },
  pill_button: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 8, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20 }, label: { ...BASE_SETTINGS.label, show: false } },
  dropdown: { ...BASE_SETTINGS, layout: { ...BASE_SETTINGS.layout, type: 'dropdown' } },
  image_dropdown: { ...BASE_SETTINGS, layout: { ...BASE_SETTINGS.layout, type: 'dropdown' } },
};

export const getOuterStyle = (isActive, settings, styleId) => {
  const b = settings.border;
  if (!b || b.outerWidth <= 0) return { display: 'inline-flex' };
  const isRound = styleId.includes('round') || styleId.includes('circle');
  return {
      padding: `${b.outerPadding || 0}px`,
      border: `${b.outerWidth || 1}px solid ${isActive ? (b.outerActiveColor || '#000') : (b.outerColor || '#ccc')}`,
      borderRadius: isRound ? '50%' : `${b.outerRadius || 0}px`,
      display: 'inline-flex',
  };
};

 export const getSwatchStyle = (isActive, settings, styleId) => {
  const b = settings.border;
  const s = settings.shadow;
  const isRound = styleId.includes('round') || styleId.includes('circle');
  const isButton = styleId.includes('button');
  const isPillSwatch = styleId === 'pill_swatch';
  
  const padding = settings.basic.padding || 0;
  const swatchSize = settings.basic.swatchSize;
  
  return {
      position: 'relative',
      boxSizing: 'border-box',
      width: (isButton || isPillSwatch) ? 'auto' : `${swatchSize + (padding * 2)}px`,
      padding: `${padding}px`,
      border: `${isActive ? (b.width + 1) : b.width || 1}px solid ${isActive ? (b.activeColor || '#000') : (b.color || '#ccc')}`,
      borderRadius: isRound ? '50%' : `${b.radius || 0}px`,
      cursor: 'pointer',
      backgroundColor: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      boxShadow: s && s.show ? `${s.offsetX || 0}px ${s.offsetY || 0}px ${s.blur || 0}px ${s.spread || 0}px ${s.color || 'rgba(0,0,0,0.1)'}` : 'none'
  };
};

export const renderBadge = (isActive, settings) => {
  if (!settings.badge || !settings.badge.show) return null;
  const b = settings.badge;
  return (
    <div style={{
      position: 'absolute',
      top: b.position.includes('top') ? '-8px' : 'auto',
      bottom: b.position.includes('bottom') ? '-8px' : 'auto',
      left: b.position.includes('left') ? '-8px' : 'auto',
      right: b.position.includes('right') ? '-8px' : 'auto',
      backgroundColor: b.bgColor || '#000',
      color: b.color || '#fff',
      fontSize: `${b.fontSize || 10}px`,
      padding: '2px 6px',
      borderRadius: '10px',
      zIndex: 10,
      fontWeight: 'bold',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
    }}>
      {b.text || 'NEW'}
    </div>
  );
};

export const PreviewRenderer = ({ styleId, settings }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const isSlide = styleId.includes('slide');
  const isButton = styleId.includes('button');
  const isDropdown = styleId.includes('dropdown');
  const isColor = styleId.includes('color');
  const isPillSwatch = styleId === 'pill_swatch';

  if (isDropdown) {
    const activeProduct = PREVIEW_PRODUCTS[1];
    const isImageDropdown = styleId === 'image_dropdown';
    
    return (
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: settings.layout.align === 'center' ? 'center' : (settings.layout.align === 'right' ? 'flex-end' : 'flex-start') }}>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            width: '100%', 
            maxWidth: '300px', 
            border: '1px solid #8c9196', 
            borderRadius: '4px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            backgroundColor: '#fff',
            padding: '8px 12px',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isImageDropdown && (
              <img src={PREVIEW_PRODUCTS[0].color} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
            )}
            <Text variant="bodyMd">{activeProduct.name}</Text>
          </div>
          <Icon source={ChevronDownIcon} tone="base" />
        </div>

        {isOpen && (
          <div style={{ 
            position: 'absolute', 
            top: '100%', 
            left: settings.layout.align === 'center' ? 'calc(50% - 150px)' : (settings.layout.align === 'right' ? 'auto' : '0'),
            right: settings.layout.align === 'right' ? '0' : 'auto',
            width: '100%', 
            maxWidth: '300px', 
            marginTop: '4px',
            backgroundColor: '#fff',
            border: '1px solid #dbdfe2',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            overflow: 'hidden'
          }}>
            {PREVIEW_PRODUCTS.map((p, index) => (
              <div key={index} style={{ padding: '10px 14px', borderBottom: index === PREVIEW_PRODUCTS.length - 1 ? 'none' : '1px solid #f1f1f1', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                {isImageDropdown && <img src={p.color} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />}
                <Text variant="bodySm">{p.name}</Text>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const containerStyle = { 
      display: 'flex', 
      gap: `${settings.basic.gap}px`, 
      flexWrap: isSlide ? 'nowrap' : 'wrap',
      overflowX: isSlide ? 'auto' : 'visible',
      justifyContent: settings.layout.align === 'center' ? 'center' : (settings.layout.align === 'right' ? 'flex-end' : 'flex-start'),
      padding: '0', 
      width: '100%'
  };

  return (
      <div style={containerStyle}>
          {PREVIEW_PRODUCTS.map((p, i) => {
              const isActive = i === 1;
              const aspectRatio = settings.basic.aspectRatio || "1:1";
              const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
              
              const isRound = (aspectRatio === "1:1") && (styleId.includes('round') || styleId.includes('circle'));
              const isTwoColor = p.style === 'two';
              
              const renderSwatchInner = () => {
                const isTwoColor = p.style === 'two';
                const size = settings.basic.swatchSize;
                const height = (size * ratioH / ratioW);
                const radius = isRound ? '50%' : `${settings.border.radius}px`;

                 if (isColor) {
                    const directions = {
                        L_R: "to right",
                        LT_RB: "to bottom right",
                        T_B: "to bottom",
                        LB_RT: "to top right"
                    };
                    const direction = directions[settings.basic.twoColorStyle] || "to bottom right";

                    return (
                        <div style={{ 
                            width: '100%', 
                            aspectRatio: '1/1',
                            borderRadius: radius, 
                            background: isTwoColor ? `linear-gradient(${direction}, ${p.colorHex} 50%, ${p.colorHex2} 50%)` : p.colorHex,
                            border: '1px solid rgba(0,0,0,0.05)'
                        }} />
                    );
                }

                if (isPillSwatch) {
                    return (
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: p.colorHex }} />
                            {(settings.variantName?.show) && (
                                <div style={{ 
                                    fontSize: `${settings.variantName?.fontSize}px`, 
                                    fontWeight: settings.variantName?.fontWeight || (isActive ? 'bold' : 'normal'),
                                    display: '-webkit-box',
                                    WebkitLineClamp: settings.variantName?.maxLines || 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {p.name.split(' ')[0]}
                                </div>
                            )}
                         </div>
                    );
                }

                // Default: Image
                return (
                    <div style={{ 
                        width: '100%', 
                        aspectRatio: `${ratioW}/${ratioH}`,
                        backgroundColor: '#eee',
                        borderRadius: radius,
                        border: '1px solid rgba(0,0,0,0.1)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <img 
                          src={p.color} 
                          alt="" 
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover',
                            objectPosition: settings.basic.imagePosition || 'center'
                          }} 
                        />
                    </div>
                );
              };

              const size = settings.basic.swatchSize;
              const height = (size * ratioH / ratioW);

              return (
                  <div key={i} style={getOuterStyle(isActive, settings, styleId)}>
                      <div style={{ 
                          ...getSwatchStyle(isActive, settings, styleId), 
                          padding: isButton ? '8px 16px' : (isPillSwatch ? '6px 12px' : `${settings.basic.padding}px`),
                      }}>
                          {isActive && renderBadge(isActive, settings)}
                          {!isButton && renderSwatchInner()}
                          {(settings.variantName?.show || isButton) && !isPillSwatch && (
                              <div style={{ 
                                  marginTop: isButton ? 0 : '8px', 
                                  paddingBottom: isButton ? 0 : '8px',
                                  textAlign: 'center',
                                  width: '100%',
                                  maxWidth: '100%',
                                  lineHeight: '1.2',
                                  wordBreak: 'break-word'
                              }}>
                                  <div style={{
                                      fontSize: `${settings.variantName?.fontSize}px`,
                                      fontWeight: settings.variantName?.fontWeight || (isActive ? 'bold' : 'normal'),
                                      display: '-webkit-box',
                                      WebkitLineClamp: settings.variantName?.maxLines || 1,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                  }}>
                                      {isButton ? (isSlide ? p.name : p.name.split(' ')[0]) : p.name}
                                  </div>
                                  
                                  {settings.price?.show && (
                                      <div style={{ 
                                          fontSize: `${settings.price?.fontSize || 10}px`, 
                                          fontWeight: settings.price?.fontWeight || 'normal',
                                          color: settings.price?.color || '#6d7175',
                                          marginTop: '2px' 
                                      }}>
                                          {p.price}
                                      </div>
                                  )}
                              </div>
                          )}
                      </div>
                  </div>
              );
          })}
      </div>
  );
};
