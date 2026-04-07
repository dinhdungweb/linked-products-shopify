import { json } from "@remix-run/node";

/**
 * Thư viện xử lý Automation logic tập trung
 * Dùng cho cả manual run (Admin UI) và auto run (Webhooks)
 */

/**
 * Chạy một quy tắc automation cụ thể (Manual Run)
 */
export async function runAutomationRule(admin, prisma, ruleId, shop, canAddLinks) {
  const rule = await prisma.automationRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new Error("Rule not found");

  let products = {};

  if (rule.type === "title_pattern") {
    const regex = new RegExp(rule.pattern, "i");
    const allProducts = await fetchAllProducts(admin);

    for (const p of allProducts) {
      const match = p.title.match(regex);
      if (match) {
        const baseKey = match[1] || match[0];
        if (!products[baseKey]) products[baseKey] = [];
        products[baseKey].push(p);
      }
    }
  } else if (rule.type === "tag") {
    const allProducts = await fetchAllProducts(admin);
    const tagName = rule.pattern.toLowerCase();
    const taggedProducts = allProducts.filter(p =>
      p.tags && p.tags.some(t => t.toLowerCase() === tagName)
    );
    if (taggedProducts.length >= 2) {
      products = { [rule.pattern]: taggedProducts };
    }
  } else if (rule.type === "sku_pattern") {
    const regex = new RegExp(rule.pattern, "i");
    const allProducts = await fetchAllProducts(admin);

    for (const p of allProducts) {
      const sku = p.sku || "";
      const match = sku.match(regex);
      if (match) {
        const baseKey = match[1] || match[0];
        if (!products[baseKey]) products[baseKey] = [];
        products[baseKey].push(p);
      }
    }
  } else if (rule.type === "collection") {
    const collectionProducts = await fetchCollectionProducts(admin, rule.pattern);
    if (collectionProducts.length >= 2) {
      products = { [rule.pattern]: collectionProducts };
    }
  }

  let groupsCreated = 0;
  for (const [groupKey, groupProducts] of Object.entries(products)) {
    if (groupProducts.length < 2) continue;

    // Kiểm tra xem sản phẩm đã thuộc nhóm nào chưa
    const productIds = groupProducts.map(p => p.id);
    const existing = await prisma.productGroupItem.findMany({
      where: { productId: { in: productIds } },
    });
    
    // Chỉ lấy những sản phẩm chưa có nhóm
    const availableProducts = groupProducts.filter(p => !existing.some(e => e.productId === p.id));
    if (availableProducts.length < 2) continue;

    // Kiểm tra giới hạn gói cước
    const canAdd = await canAddLinks(shop, 1);
    if (!canAdd) break;

    // Tạo nhóm mới
    const groupName = `${rule.name} - ${groupKey}`;
    const newGroup = await prisma.productGroup.create({
      data: {
        shop,
        name: groupName,
        optionName: rule.optionName,
        selectorStyle: rule.selectorStyle,
      },
    });

    // Thêm sản phẩm vào nhóm
    for (let i = 0; i < availableProducts.length; i++) {
      await prisma.productGroupItem.create({
        data: {
          groupId: newGroup.id,
          productId: availableProducts[i].id,
          productHandle: availableProducts[i].handle,
          optionValue: availableProducts[i].title,
          position: i + 1,
        },
      });
    }

    // Đồng bộ Metafields
    await syncGroupMetafields(admin, prisma, newGroup.id);
    groupsCreated++;
  }

  // Cập nhật thông tin rule
  await prisma.automationRule.update({
    where: { id: ruleId },
    data: {
      lastRunAt: new Date(),
      groupsCreated: { increment: groupsCreated },
    },
  });

  return groupsCreated;
}

/**
 * Xử lý Automation cho một sản phẩm cụ thể (Dùng cho Webhook)
 */
export async function processAutomationsForProduct(admin, prisma, productId, shop, canAddLinks) {
  // 1. Lấy thông tin sản phẩm đầy đủ từ Shopify
  const response = await admin.graphql(`
    query ($id: ID!) {
      product(id: $id) {
        id title handle tags 
        variants(first: 1) { nodes { sku } }
      }
    }
  `, { variables: { id: productId } });
  
  const result = await response.json();
  const product = result.data?.product;
  if (!product) return;

  const productData = {
    id: product.id,
    title: product.title,
    handle: product.handle,
    tags: product.tags || [],
    sku: product.variants?.nodes?.[0]?.sku || "",
  };

  // 2. Kiểm tra xem sản phẩm đã thuộc nhóm nào chưa
  const existing = await prisma.productGroupItem.findFirst({
    where: { productId },
  });
  if (existing) return;

  // 3. Lấy tất cả Rule đang Active, ưu tiên cái mới nhất (quy định bởi dev)
  const rules = await prisma.automationRule.findMany({
    where: { shop, status: "active" },
    orderBy: { updatedAt: "desc" },
  });

  for (const rule of rules) {
    let matchKey = null;

    if (rule.type === "title_pattern") {
      const match = productData.title.match(new RegExp(rule.pattern, "i"));
      if (match) matchKey = match[1] || match[0];
    } else if (rule.type === "tag") {
      if (productData.tags.some(t => t.toLowerCase() === rule.pattern.toLowerCase())) {
        matchKey = rule.pattern;
      }
    } else if (rule.type === "sku_pattern") {
      const match = productData.sku.match(new RegExp(rule.pattern, "i"));
      if (match) matchKey = match[1] || match[0];
    } else if (rule.type === "collection") {
      const checkResponse = await admin.graphql(`
        query ($id: ID!, $collectionHandle: String!) {
          product(id: $id) {
            inCollection: inCollection(handle: $collectionHandle)
          }
        }
      `, { variables: { id: productId, collectionHandle: rule.pattern } });
      const checkResult = await checkResponse.json();
      if (checkResult.data?.product?.inCollection) matchKey = rule.pattern;
    }

    if (matchKey) {
      const groupNamePattern = `${rule.name} - ${matchKey}`;
      
      // Tìm xem đã có nhóm nào được tạo bởi Rule này với Key này chưa
      let group = await prisma.productGroup.findFirst({
        where: { shop, name: groupNamePattern },
        include: { _count: { select: { products: true } } }
      });

      if (group) {
        // Thêm sản phẩm này vào nhóm hiện có
        await prisma.productGroupItem.create({
          data: {
            groupId: group.id,
            productId: productData.id,
            productHandle: productData.handle,
            optionValue: productData.title,
            position: group._count.products + 1,
          },
        });
        await syncGroupMetafields(admin, prisma, group.id);
        break; // Khớp 1 Rule là đủ (Thứ tự ưu tiên)
      } else {
        // Nếu chưa có nhóm, thử xem có sản phẩm nào khác cùng pattern để tạo nhóm mới không
        const allProducts = await fetchAllProducts(admin);
        const matchingProducts = [];

        for (const p of allProducts) {
          let pKey = null;
          if (rule.type === "title_pattern") {
            const m = p.title.match(new RegExp(rule.pattern, "i"));
            if (m) pKey = m[1] || m[0];
          } else if (rule.type === "tag") {
            if (p.tags.some(t => t.toLowerCase() === rule.pattern.toLowerCase())) pKey = rule.pattern;
          } else if (rule.type === "sku_pattern") {
            const m = p.sku.match(new RegExp(rule.pattern, "i"));
            if (m) pKey = m[1] || m[0];
          }
          if (pKey === matchKey) matchingProducts.push(p);
        }

        if (matchingProducts.length >= 2) {
          // Chỉ lấy những sản phẩm chưa có nhóm
          const pIds = matchingProducts.map(p => p.id);
          const existingItems = await prisma.productGroupItem.findMany({
            where: { productId: { in: pIds } }
          });
          const available = matchingProducts.filter(p => !existingItems.some(e => e.productId === p.id));

          if (available.length >= 2) {
            const canAdd = await canAddLinks(shop, 1);
            if (canAdd) {
              const newGroup = await prisma.productGroup.create({
                data: {
                  shop,
                  name: groupNamePattern,
                  optionName: rule.optionName,
                  selectorStyle: rule.selectorStyle,
                },
              });
              for (let i = 0; i < available.length; i++) {
                await prisma.productGroupItem.create({
                  data: {
                    groupId: newGroup.id,
                    productId: available[i].id,
                    productHandle: available[i].handle,
                    optionValue: available[i].title,
                    position: i + 1,
                  },
                });
              }
              await syncGroupMetafields(admin, prisma, newGroup.id);
              break;
            }
          }
        }
      }
    }
  }
}

// Helpers

async function fetchAllProducts(admin) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const query = `query ($cursor: String) { products(first: 100, after: $cursor) { edges { cursor node { id title handle tags variants(first: 1) { nodes { sku } } } } pageInfo { hasNextPage } } }`;
    const response = await admin.graphql(query, { variables: { cursor } });
    const result = await response.json();
    const edges = result.data?.products?.edges || [];
    for (const edge of edges) {
      products.push({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        tags: edge.node.tags || [],
        sku: edge.node.variants?.nodes?.[0]?.sku || "",
      });
      cursor = edge.cursor;
    }
    hasNextPage = result.data?.products?.pageInfo?.hasNextPage || false;
  }
  return products;
}

async function fetchCollectionProducts(admin, collectionIdOrHandle) {
  const products = [];
  let collectionGid = collectionIdOrHandle;
  if (!collectionIdOrHandle.startsWith("gid://")) {
    const searchResponse = await admin.graphql(`query ($handle: String!) { collectionByHandle(handle: $handle) { id } }`, { variables: { handle: collectionIdOrHandle } });
    const searchResult = await searchResponse.json();
    collectionGid = searchResult.data?.collectionByHandle?.id;
    if (!collectionGid) return products;
  }
  let cursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const query = `query ($id: ID!, $cursor: String) { collection(id: $id) { products(first: 100, after: $cursor) { edges { cursor node { id title handle } } pageInfo { hasNextPage } } } }`;
    const response = await admin.graphql(query, { variables: { id: collectionGid, cursor } });
    const result = await response.json();
    const edges = result.data?.collection?.products?.edges || [];
    for (const edge of edges) {
      products.push({ id: edge.node.id, title: edge.node.title, handle: edge.node.handle });
      cursor = edge.cursor;
    }
    hasNextPage = result.data?.collection?.products?.pageInfo?.hasNextPage || false;
  }
  return products;
}

export async function syncGroupMetafields(admin, prisma, groupId) {
  const group = await prisma.productGroup.findUnique({
    where: { id: groupId },
    include: { products: { orderBy: { position: "asc" } } },
  });
  if (!group || group.products.length < 2) return;
  const metafieldValue = group.products.map(p => ({
    handle: p.productHandle,
    title: p.optionValue || "",
    image: p.customImageUrl || "",
    color: p.customColor || ""
  }));
  const metafields = [];
  for (const product of group.products) {
    metafields.push(
      { ownerId: product.productId, namespace: "linked_products", key: "linked_list", value: JSON.stringify(metafieldValue), type: "json" },
      { ownerId: product.productId, namespace: "linked_products", key: "option_value", value: product.optionValue || "", type: "single_line_text_field" },
      { ownerId: product.productId, namespace: "linked_products", key: "inventory_behavior", value: group.inventoryBehavior || "show", type: "single_line_text_field" },
      { ownerId: product.productId, namespace: "linked_products", key: "option_name", value: group.optionName || "Color", type: "single_line_text_field" },
      { ownerId: product.productId, namespace: "linked_products", key: "selector_style", value: group.selectorStyle || "button", type: "single_line_text_field" },
    );
  }
  const BATCH_SIZE = 25;
  for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
    const batch = metafields.slice(i, i + BATCH_SIZE);
    await admin.graphql(`mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } } }`, { variables: { metafields: batch } });
  }
  await prisma.productGroup.update({ where: { id: groupId }, data: { syncStatus: "synced" } });
}
