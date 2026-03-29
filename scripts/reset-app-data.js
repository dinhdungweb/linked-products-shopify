const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("\x1b[33m%s\x1b[0m", "--- BẮT ĐẦU QUÁ TRÌNH RESET DỮ LIỆU ---");
  
  try {
    // Tạm thời tắt check foreign key nếu cần (tùy thuộc vào loại DB, ở đây dùng delete theo thứ tự an toàn)
    console.log("1. Đang xóa các sản phẩm trong nhóm (ProductGroupItem)...");
    await prisma.productGroupItem.deleteMany({});
    
    console.log("2. Đang xóa các nhóm sản phẩm (ProductGroup)...");
    await prisma.productGroup.deleteMany({});
    
    console.log("3. Đang xóa các quy tắc tự động (AutomationRule)...");
    await prisma.automationRule.deleteMany({});
    
    console.log("4. Đang xóa cài đặt hiển thị (AppSetting)...");
    await prisma.appSetting.deleteMany({});
    
    console.log("5. Đang xóa cấu hình Style (OptionStyleSetting)...");
    await prisma.optionStyleSetting.deleteMany({});

    console.log("\x1b[32m%s\x1b[0m", "--- RESET DỮ LIỆU THÀNH CÔNG! ---");
    console.log("Dữ liệu về các nhóm sản phẩm và cài đặt đã được dọn sạch.");
    console.log("Phiên đăng nhập (Session) vẫn được giữ lại.");
  } catch (error) {
    console.error("\x1b[31m%s\x1b[0m", "Lỗi trong quá trình reset:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
