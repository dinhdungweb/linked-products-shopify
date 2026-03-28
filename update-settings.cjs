const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Đang cập nhật tất cả cài đặt AppSetting về mặc định mới...');
  
  const result = await prisma.appSetting.updateMany({
    data: {
      swatchSize: 50,
      itemsGap: 8,
      borderRadius: 8,
      borderWidth: 1,
      showOptionName: true,
      borderColor: '#e5e5e5',
      selectedBorderColor: '#000000',
      blockPaddingX: 12,
      blockPaddingY: 8,
      blockFontSize: 14,
      blockBgColor: '#ffffff',
      blockTextColor: '#000000',
      selectedBgColor: '#dddddd',
      selectedTextColor: '#000000',
    }
  });

  console.log(`✅ Thành công! Đã cập nhật ${result.count} cửa hàng.`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi cập nhật:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
