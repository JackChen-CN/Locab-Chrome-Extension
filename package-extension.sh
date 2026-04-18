#!/bin/bash
# Locab Chrome 扩展打包脚本
# 用于创建发布包和生成CRX文件

set -e  # 遇到错误时退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 扩展信息
EXTENSION_NAME="Locab"
EXTENSION_DIR=$(pwd)
VERSION=$(grep '"version"' "$EXTENSION_DIR/manifest.json" | cut -d\" -f4)

# 输出目录
RELEASE_DIR="$EXTENSION_DIR/releases"
ZIP_FILE="$RELEASE_DIR/locab-v$VERSION.zip"

echo -e "${BLUE}=== Locab Chrome 扩展打包工具 ===${NC}"
echo -e "版本: ${GREEN}$VERSION${NC}"
echo -e "目录: ${GREEN}$EXTENSION_DIR${NC}"
echo

# 检查必需文件
check_required_files() {
    echo -e "${BLUE}检查必需文件...${NC}"

    local required_files=(
        "manifest.json"
        "background.js"
        "content.js"
        "popup.html"
        "popup.js"
        "styles.css"
        "icons/icon16.png"
        "icons/icon48.png"
        "icons/icon128.png"
    )

    local missing_files=()

    for file in "${required_files[@]}"; do
        if [[ ! -f "$EXTENSION_DIR/$file" ]] && [[ ! -d "$EXTENSION_DIR/$file" ]]; then
            missing_files+=("$file")
        fi
    done

    if [[ ${#missing_files[@]} -gt 0 ]]; then
        echo -e "${RED}错误: 缺少必需文件:${NC}"
        for file in "${missing_files[@]}"; do
            echo -e "  ${RED}✗${NC} $file"
        done
        exit 1
    else
        echo -e "${GREEN}✓ 所有必需文件都存在${NC}"
    fi
}

# 创建ZIP包（用于Chrome Web Store）
create_zip_package() {
    echo -e "\n${BLUE}创建ZIP包（用于Chrome Web Store）...${NC}"

    # 创建发布目录
    mkdir -p "$RELEASE_DIR"

    # 创建ZIP文件（排除不需要的文件）
    cd "$EXTENSION_DIR"
    zip -r "$ZIP_FILE" . \
        -x "*.git*" \
        -x "*.claude*" \
        -x "*.DS_Store" \
        -x "*.log" \
        -x "*.bak" \
        -x "*.backup" \
        -x "test-*" \
        -x "local-*" \
        -x "debug-*" \
        -x "releases/*" \
        -x "package-extension.sh" \
        -x "README.md" \
        -x "INSTALL.txt" \
        -x "*.md" \
        -x "*.txt" \
        > /dev/null 2>&1

    local zip_size=$(du -h "$ZIP_FILE" | cut -f1)
    echo -e "${GREEN}✓ ZIP包创建成功:${NC}"
    echo -e "  文件: ${GREEN}$(basename "$ZIP_FILE")${NC}"
    echo -e "  大小: ${GREEN}$zip_size${NC}"
    echo -e "  位置: ${GREEN}$RELEASE_DIR${NC}"
}

# 生成CRX文件指南
generate_crx_guide() {
    echo -e "\n${BLUE}生成CRX文件（本地安装）...${NC}"
    echo -e "${YELLOW}注意: CRX文件需要使用Chrome浏览器生成${NC}"
    echo
    echo -e "步骤:"
    echo -e "  1. 打开 Chrome 浏览器"
    echo -e "  2. 访问 ${BLUE}chrome://extensions/${NC}"
    echo -e "  3. 开启右上角的'开发者模式'"
    echo -e "  4. 点击'打包扩展程序'按钮"
    echo -e "  5. 扩展程序根目录选择:"
    echo -e "     ${GREEN}$EXTENSION_DIR${NC}"
    echo -e "  6. 私钥文件留空（首次打包）"
    echo -e "  7. 点击'打包扩展程序'"
    echo
    echo -e "生成的文件:"
    echo -e "  ${GREEN}locab.crx${NC} - 可安装的扩展文件"
    echo -e "  ${GREEN}locab.pem${NC} - ${RED}重要！必须备份的私钥文件${NC}"
    echo
    echo -e "${YELLOW}重要提示:${NC}"
    echo -e "  • 私钥文件(.pem)是扩展的唯一标识"
    echo -e "  • 没有原始.pem文件无法更新扩展"
    echo -e "  • 请保存在安全位置，建议多处备份"
}

# 安装测试指南
install_test_guide() {
    echo -e "\n${BLUE}安装和测试扩展...${NC}"
    echo -e "方法1 - 加载已解压的扩展（开发模式）:"
    echo -e "  1. 打开 ${BLUE}chrome://extensions/${NC}"
    echo -e "  2. 开启'开发者模式'"
    echo -e "  3. 点击'加载已解压的扩展程序'"
    echo -e "  4. 选择目录: ${GREEN}$EXTENSION_DIR${NC}"
    echo
    echo -e "方法2 - 安装CRX文件:"
    echo -e "  1. 将 ${GREEN}locab.crx${NC} 文件拖拽到 ${BLUE}chrome://extensions/${NC} 页面"
    echo -e "  2. 确认安装"
    echo
    echo -e "测试功能:"
    echo -e "  • 在任意网页上选中单词，右键点击'标记生词'"
    echo -e "  • 点击浏览器工具栏中的Locab图标打开管理面板"
    echo -e "  • 测试搜索、删除、定位、复习等功能"
}

# 发布到Chrome Web Store指南
publish_guide() {
    echo -e "\n${BLUE}发布到Chrome Web Store...${NC}"
    echo -e "步骤:"
    echo -e "  1. 访问 ${BLUE}https://chrome.google.com/webstore/devconsole/${NC}"
    echo -e "  2. 使用Google账号登录（需要支付一次性5美元费用）"
    echo -e "  3. 点击'添加新扩展程序'"
    echo -e "  4. 上传ZIP文件: ${GREEN}$(basename "$ZIP_FILE")${NC}"
    echo -e "  5. 填写扩展信息:"
    echo -e "     • 详细描述"
    echo -e "     • 分类"
    echo -e "     • 隐私政策（如果需要）"
    echo -e "     • 截图和图标"
    echo -e "  6. 提交审核"
    echo -e "  7. 审核通过后发布"
    echo
    echo -e "${YELLOW}注意:${NC}"
    echo -e "  • 确保隐私政策符合要求"
    echo -e "  • 提供清晰的功能说明和截图"
    echo -e "  • 审核通常需要几天时间"
}

# 主函数
main() {
    echo -e "${BLUE}开始打包扩展...${NC}"

    # 检查必需文件
    check_required_files

    # 创建ZIP包
    create_zip_package

    # 显示指南
    generate_crx_guide
    install_test_guide
    publish_guide

    echo -e "\n${GREEN}=== 打包完成 ===${NC}"
    echo -e "总结:"
    echo -e "  • ZIP包: ${GREEN}$(basename "$ZIP_FILE")${NC} (用于Chrome Web Store)"
    echo -e "  • 手动生成CRX文件用于本地安装"
    echo -e "  • 使用'加载已解压的扩展程序'进行开发测试"
    echo -e "\n${YELLOW}下一步:${NC}"
    echo -e "  1. 使用上述指南生成CRX文件"
    echo -e "  2. 测试扩展功能"
    echo -e "  3. 考虑发布到Chrome Web Store"
}

# 运行主函数
main "$@"