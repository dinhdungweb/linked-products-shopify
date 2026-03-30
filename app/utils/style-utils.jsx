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
  { name: 'Pink', color: IMAGES[4], colorHex: '#d85a7e', style: 'one', price: '$12.88' },
  { name: 'Bright Navy Blue', color: IMAGES[1], colorHex: '#add8e6', style: 'one', price: '$15.99', isUnavailable: true },
  { name: 'Orange', color: IMAGES[2], colorHex: '#d2691e', style: 'one', price: '$19.99' },
  { name: 'Slate Blue', color: IMAGES[5], colorHex: '#483d8b', style: 'one', price: '$24.99' },
  { name: 'Teal Blue', color: IMAGES[3], colorHex: '#008080', style: 'one', price: '$18.50' }
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
  slide_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 90, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0, width: 1, color: "#ccc", activeColor: "#000", outerWidth: 0 }, layout: { ...BASE_SETTINGS.layout, type: 'slide' }, price: { ...BASE_SETTINGS.price, show: true } },
  polaroid_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 52, padding: 4, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0 }, shadow: { ...BASE_SETTINGS.shadow, show: true, color: "rgba(0,0,0,0.1)", blur: 3, offsetY: 1 }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  color_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 32, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20, width: 2, color: "#ffffff", activeColor: "#ffffff", outerWidth: 2, outerPadding: 2, outerActiveColor: "#5c6ac4", outerRadius: 20, outerColor: "#dddddd" }, label: { ...BASE_SETTINGS.label, show: false }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  square_color_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 32, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 4, width: 2, color: "#ffffff", activeColor: "#ffffff", outerWidth: 2, outerPadding: 2, outerActiveColor: "#5c6ac4", outerRadius: 6, outerColor: "#dddddd" }, label: { ...BASE_SETTINGS.label, show: false }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  pill_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 6, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20 } },
  button: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 8, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0 }, label: { ...BASE_SETTINGS.label, show: false } },
  pill_button: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 8, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20 }, label: { ...BASE_SETTINGS.label, show: false } },
  dropdown: { ...BASE_SETTINGS, layout: { ...BASE_SETTINGS.layout, type: 'dropdown' } },
  image_dropdown: {
    ...BASE_SETTINGS,
    swatch: { ...BASE_SETTINGS.swatch, size: 24, borderRadius: 4 },
    label: { ...BASE_SETTINGS.label, show: true, fontSize: 14 }
  },
  button_card: {
    ...BASE_SETTINGS,
    basic: { ...BASE_SETTINGS.basic, swatchSize: 0, padding: 8, limitDesktop: 5 },
    label: { ...BASE_SETTINGS.label, show: true, fontSize: 12, border: true }
  },
  dropdown_card: {
    ...BASE_SETTINGS,
    basic: { ...BASE_SETTINGS.basic, padding: 8, limitDesktop: 5 },
    label: { ...BASE_SETTINGS.label, show: true, fontSize: 13, border: true }
  },
  image_swatch_card: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 24, gap: 8, padding: 0, limitDesktop: 5 }, border: { ...BASE_SETTINGS.border, radius: 12 }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
  color_swatch_card: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 24, gap: 8, padding: 0, limitDesktop: 5 }, border: { ...BASE_SETTINGS.border, radius: 12 }, variantName: { ...BASE_SETTINGS.variantName, show: false } },
};

export const getOuterStyle = (isActive, settings, styleId, isCard = false) => {
  const b = settings.border;
  if (!b || b.outerWidth <= 0) return { display: 'inline-flex' };
  
  // Use radius from settings if available, otherwise fallback to circle for specific styles
  const radius = b.outerRadius !== undefined ? `${b.outerRadius}px` : (styleId.includes('round') || styleId.includes('circle') ? '50%' : '2px');
  
  return {
      padding: `${b.outerPadding || 0}px`,
      border: `${b.outerWidth || 1}px solid ${isActive ? (b.outerActiveColor || '#000') : (b.outerColor || '#ccc')}`,
      borderRadius: radius,
      display: 'inline-flex',
  };
};

 export const getSwatchStyle = (isActive, settings, styleId, isCard = false) => {
  const b = settings.border;
  const s = settings.shadow;
  const isRound = styleId.includes('round') || styleId.includes('circle');
  const isButton = styleId.includes('button');
  const isPillSwatch = styleId === 'pill_swatch';
  
  const padding = settings.basic?.padding ?? settings.swatch?.padding ?? 0;
  const swatchSize = settings.basic?.swatchSize ?? settings.swatch?.size ?? 24;
  
  return {
      position: 'relative',
      boxSizing: 'border-box',
      width: (isButton || isPillSwatch) ? 'auto' : `${swatchSize + (padding * 2)}px`,
      padding: `${padding}px`,
      border: `${isActive ? (b.width + 1) : b.width || 1}px solid ${isActive ? (b.activeColor || '#000') : (b.color || '#ccc')}`,
      borderRadius: (b.radius !== undefined) ? `${b.radius}px` : (isRound ? '50%' : '0px'),
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

export const renderUnavailableEffect = (isUnavailable, style = "cross_mark") => {
  if (!isUnavailable || style === "none" || style === "hide") return null;

  if (style === "gray") {
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        zIndex: 5,
        borderRadius: 'inherit',
        backdropFilter: 'grayscale(1)'
      }} />
    );
  }

  if (style === "overlay") {
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.1)',
        zIndex: 5,
        borderRadius: 'inherit'
      }} />
    );
  }

  // Default: cross_mark
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 5,
      overflow: 'hidden',
      borderRadius: 'inherit'
    }}>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '142%',
        height: '1px',
        backgroundColor: '#ff4d4f',
        transform: 'translate(-50%, -50%) rotate(-45deg)',
        boxShadow: '0 0 1px rgba(0,0,0,0.2)'
      }} />
    </div>
  );
};

 export const PreviewRenderer = ({ styleId, settings, products, appSettings, isCard = false, hideLabel = false, label }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  
  const displayProducts = (products || PREVIEW_PRODUCTS).map(p => ({
    name: p.optionValue || p.name || '',
    color: p.customImageUrl || p.image || p.color || '',
    colorHex: p.customColor || p.colorHex || '#ffffff',
    colorHex2: p.customColor2 || p.colorHex2 || '#f5f5f5',
    style: p.style || 'one',
    price: p.price || (p.variants?.[0]?.price ? `$${p.variants[0].price}` : '$12.88'),
    isUnavailable: p.isUnavailable || false
  }));

  const isSlide = styleId.includes('slide');
  const isButton = styleId.includes('button');
  const isDropdown = styleId.includes('dropdown');
  const isColor = styleId.includes('color');
  const isPillSwatch = styleId === 'pill_swatch';
  
  // Separation of limits: maxSwatches for Product Page, limitDesktop for Card
  const displayLimit = isCard 
    ? (parseInt(settings.basic?.limitDesktop) || 5) 
    : (parseInt(settings.layout?.maxSwatches) || 100);
  
  const finalDisplayProducts = displayProducts.filter(p => !(p.isUnavailable && settings.basic?.unavailableStyle === 'hide'));
  const extraCount = finalDisplayProducts.length > displayLimit ? finalDisplayProducts.length - displayLimit : 0;
  const itemsToRender = finalDisplayProducts.slice(0, displayLimit);
  
  if (isCard && appSettings?.cardDisplayMode === 'count') {
    return (
        <div style={{ padding: '4px 0', borderBottom: settings.border?.width ? 'none' : '1px solid #eee' }}>
            <Text variant="bodySm" tone="subdued">
                {finalDisplayProducts.length === 1 ? '1 option' : `${finalDisplayProducts.length} options`}
            </Text>
        </div>
    );
  }

  const showLabel = isCard ? (appSettings?.cardShowLabel ?? false) : settings.variantName?.show;
  const shouldShowName = (showLabel || isButton) && !isPillSwatch && !(isCard && (isColor || styleId.includes('image_swatch')));

  if (isDropdown) {
    const activeProduct = displayProducts[0] || PREVIEW_PRODUCTS[1];
    const isImageDropdown = styleId === 'image_dropdown';
    const borderRadius = `${settings.border.radius}px`;
    
    return (
      <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            width: '100%', 
            border: `1px solid ${settings.border.color || '#8c9196'}`, 
            borderRadius: borderRadius, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            backgroundColor: '#fff',
            padding: '10px 14px',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 10,
            transition: 'all 0.2s ease',
            boxShadow: settings.shadow?.show ? `${settings.shadow.offsetX}px ${settings.shadow.offsetY}px ${settings.shadow.blur}px ${settings.shadow.color}` : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isImageDropdown && (
              <div style={{ 
                width: `${settings.basic.swatchSize || settings.swatch?.size || 32}px`, 
                height: `${settings.basic.swatchSize || settings.swatch?.size || 32}px`, 
                borderRadius: '4px', 
                overflow: 'hidden',
                flexShrink: 0
              }}>
                <img 
                  src={activeProduct.color} 
                  alt="" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Text variant="bodyMd" fontWeight="medium">{activeProduct.name}</Text>
                {settings.price?.show && (
                    <Text variant="bodySm" tone="subdued">{activeProduct.price}</Text>
                )}
            </div>
          </div>
          <div style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            <Icon source={ChevronDownIcon} tone="base" />
          </div>
        </div>

        {isOpen && (
          <div style={{ 
            position: 'absolute', 
            top: '100%', 
            left: '0',
            width: '100%', 
            marginTop: '8px',
            border: '1px solid #dbdfe2',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            zIndex: 100,
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            {displayProducts.map((p, index) => (
              <div 
                key={index} 
                style={{ 
                    padding: '12px 14px', 
                    borderBottom: index === displayProducts.length - 1 ? 'none' : '1px solid #f1f1f1', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: '12px', 
                    cursor: 'pointer',
                    backgroundColor: index === 1 ? '#f6f6f6' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {isImageDropdown && (
                        <img 
                            src={p.color} 
                            alt="" 
                            style={{ width: '36px', height: '36px', borderRadius: '4px', objectFit: 'cover' }} 
                        />
                    )}
                    <Text variant="bodyMd">{p.name}</Text>
                </div>
                {settings.price?.show && (
                    <Text variant="bodySm" tone="subdued">{p.price}</Text>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const activeOptionName = label || (isCard ? 'Options' : (appSettings?.optionName || 'Color'));

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
      <div style={{ width: '100%' }}>
          {!hideLabel && settings.label?.show && (
              <div style={{ 
                  marginBottom: `${settings.label?.gap || 8}px`,
                  textAlign: settings.layout?.align || 'left',
                  display: 'flex',
                  justifyContent: settings.layout?.align === 'center' ? 'center' : (settings.layout?.align === 'right' ? 'flex-end' : 'flex-start'),
                  color: '#202223'
              }}>
                   <div style={{ 
                       display: 'flex', 
                       flexDirection: (settings.label?.layout === 'stack' ? 'column' : 'row'),
                       alignItems: (settings.label?.layout === 'stack' ? (settings.layout?.align === 'center' ? 'center' : (settings.layout?.align === 'right' ? 'flex-end' : 'flex-start')) : 'center'),
                       gap: (settings.label?.layout === 'stack' ? '4px' : '8px'),
                       fontSize: `${settings.label?.fontSize || 14}px`,
                       lineHeight: `${settings.label?.lineHeight || (settings.label?.fontSize || 14) + 4}px`
                   }}>
                        <span style={{ 
                            color: '#6d7175',
                            fontWeight: settings.label?.fontWeight || 'normal'
                        }}>
                            {activeOptionName}:
                        </span>
                        {settings.label?.showSelectedVariant && (
                            <span style={{ 
                                fontWeight: settings.label?.selectedVariantFontWeight || 'semibold' 
                            }}>
                                {displayProducts[1]?.name || 'Liquid'}
                            </span>
                        )}
                   </div>
              </div>
          )}

          <div style={{ ...containerStyle, marginTop: isCard ? 0 : `${settings.layout?.marginTop || 0}px`, marginBottom: isCard ? 0 : `${settings.layout?.marginBottom || 0}px` }}>
              {itemsToRender.map((p, i) => {
                  const isActive = i === 1;
                  const aspectRatio = settings.basic.aspectRatio || "1:1";
                  const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
                  
                  const isRound = (aspectRatio === "1:1") && (styleId.includes('round') || styleId.includes('circle'));
                  
                  const renderSwatchInner = () => {
                    const size = settings.basic.swatchSize || settings.swatch?.size || 32;
                    const radius = isRound ? '50%' : `${settings.border.radius}px`;

                     if (isColor) {
                        const directions = { L_R: "to right", LT_RB: "to bottom right", T_B: "to bottom", LB_RT: "to top right" };
                        const direction = directions[settings.basic.twoColorStyle] || "to bottom right";
                        return ( <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: radius, background: p.style === 'two' ? `linear-gradient(${direction}, ${p.colorHex} 50%, ${p.colorHex2} 50%)` : p.colorHex }} /> );
                    }

                    if (isPillSwatch) {
                        return (
                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: p.colorHex }} />
                                {(settings.variantName?.show) && (
                                    <div style={{ fontSize: `${settings.variantName?.fontSize}px`, fontWeight: settings.variantName?.fontWeight || (isActive ? 'bold' : 'normal'), display: '-webkit-box', WebkitLineClamp: settings.variantName?.maxLines || 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {p.name}
                                    </div>
                                )}
                             </div>
                        );
                    }

                    return (
                        <div style={{ width: '100%', aspectRatio: `${ratioW}/${ratioH}`, backgroundColor: '#eee', borderRadius: radius, position: 'relative', overflow: 'hidden' }}>
                            <img src={p.color} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: settings.basic.imagePosition || 'center' }} />
                        </div>
                    );
                  };

                  return (
                      <div key={i} style={getOuterStyle(isActive, settings, styleId, isCard)}>
                          <div style={{ 
                              ...getSwatchStyle(isActive, settings, styleId, isCard), 
                              padding: (isButton || isPillSwatch) 
                                  ? `${settings.basic?.padding ?? 8}px ${settings.basic?.padding ? settings.basic.padding * 2 : 12}px` 
                                  : `${settings.basic?.padding ?? settings.swatch?.padding ?? 0}px` 
                          }}>
                              {isActive && renderBadge(isActive, settings)}
                              {!isButton && renderSwatchInner()}
                              {renderUnavailableEffect(p.isUnavailable, settings.basic?.unavailableStyle ?? "cross_mark")}
                              {shouldShowName && (
                                  <div style={{ padding: isButton ? 0 : '5px', textAlign: 'center', width: '100%', maxWidth: '100%', lineHeight: '1.2', wordBreak: 'break-word', boxSizing: 'border-box' }}>
                                      <div style={{ fontSize: `${settings.variantName?.fontSize}px`, fontWeight: settings.variantName?.fontWeight || (isActive ? 'bold' : 'normal'), display: '-webkit-box', WebkitLineClamp: settings.variantName?.maxLines || 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {p.name}
                                      </div>
                                      {settings.price?.show && ( <div style={{ fontSize: `${settings.price?.fontSize || 10}px`, fontWeight: settings.price?.fontWeight || 'normal', color: settings.price?.color || '#6d7175', marginTop: '3px' }}>{p.price}</div> )}
                                  </div>
                              )}
                          </div>
                      </div>
                  );
              })}
              {extraCount > 0 && (
                  <div style={{ ...getSwatchStyle(false, settings, styleId, isCard), border: 'none', width: 'auto', minWidth: '24px', padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="bodyXs" fontWeight="bold" tone="subdued">+{extraCount}</Text>
                  </div>
              )}
          </div>
      </div>
  );
};
