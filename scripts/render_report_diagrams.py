from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FONT_REGULAR = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"


def font(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def rounded_box(draw, xy, radius=18, fill="#FFFFFF", outline="#B71C1C", width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def centered_text(draw, box, text, text_font, fill="#202124", spacing=6):
    x1, y1, x2, y2 = box
    lines = text.split("\n")
    metrics = [draw.textbbox((0, 0), line, font=text_font) for line in lines]
    heights = [m[3] - m[1] for m in metrics]
    total_height = sum(heights) + spacing * (len(lines) - 1)
    current_y = y1 + ((y2 - y1) - total_height) / 2
    for line, metric, line_h in zip(lines, metrics, heights):
        line_w = metric[2] - metric[0]
        current_x = x1 + ((x2 - x1) - line_w) / 2
        draw.text((current_x, current_y), line, font=text_font, fill=fill)
        current_y += line_h + spacing


def draw_arrow(draw, start, end, fill="#8D1B1B", width=4, head=14):
    draw.line([start, end], fill=fill, width=width)
    x1, y1 = start
    x2, y2 = end
    if x1 == x2:
        if y2 > y1:
            pts = [(x2, y2), (x2 - head, y2 - head), (x2 + head, y2 - head)]
        else:
            pts = [(x2, y2), (x2 - head, y2 + head), (x2 + head, y2 + head)]
    else:
        if x2 > x1:
            pts = [(x2, y2), (x2 - head, y2 - head), (x2 - head, y2 + head)]
        else:
            pts = [(x2, y2), (x2 + head, y2 - head), (x2 + head, y2 + head)]
    draw.polygon(pts, fill=fill)


def draw_label(draw, pos, text, size=18, fill="#5F6368", anchor="mm"):
    draw.text(pos, text, font=font(size), fill=fill, anchor=anchor)


def render_dfd():
    img = Image.new("RGB", (1800, 1120), "#FFF9F6")
    draw = ImageDraw.Draw(img)

    title_font = font(36, bold=True)
    draw.text((72, 42), "数据流图（DFD）", font=title_font, fill="#8D1B1B")
    draw.text((72, 92), "当前阶段用于说明系统主链路、角色入口和数据归集方向。", font=font(20), fill="#5F6368")

    boxes = {
        "applicant": (90, 220, 350, 320),
        "miniapp": (500, 180, 820, 300),
        "manager": (90, 410, 350, 530),
        "admin": (90, 610, 350, 730),
        "webadmin": (500, 420, 820, 560),
        "api": (980, 280, 1320, 420),
        "db": (1450, 150, 1700, 250),
        "upload": (1450, 330, 1700, 430),
        "export": (1450, 510, 1700, 610),
    }

    fills = {
        "role": "#FFF0F0",
        "entry": "#FFFFFF",
        "core": "#FDECEC",
        "storage": "#FFFFFF",
    }

    rounded_box(draw, boxes["applicant"], fill=fills["role"])
    centered_text(draw, boxes["applicant"], "入党申请人", font(24, bold=True), fill="#8D1B1B")

    rounded_box(draw, boxes["manager"], fill=fills["role"])
    centered_text(draw, boxes["manager"], "支部书记 / 组织员 /\n书记 / 副书记", font(22, bold=True), fill="#8D1B1B")

    rounded_box(draw, boxes["admin"], fill=fills["role"])
    centered_text(draw, boxes["admin"], "组织部 / 超级管理员", font(24, bold=True), fill="#8D1B1B")

    rounded_box(draw, boxes["miniapp"], fill=fills["entry"])
    centered_text(draw, boxes["miniapp"], "微信小程序", font(28, bold=True))

    rounded_box(draw, boxes["webadmin"], fill=fills["entry"])
    centered_text(draw, boxes["webadmin"], "后台管理端\n（桌面后台 / 移动后台）", font(26, bold=True))

    rounded_box(draw, boxes["api"], fill=fills["core"], outline="#8D1B1B", width=3)
    centered_text(draw, boxes["api"], "Node.js API 服务端", font(28, bold=True), fill="#8D1B1B")

    rounded_box(draw, boxes["db"], fill=fills["storage"])
    centered_text(draw, boxes["db"], "MySQL 数据库", font(24, bold=True))

    rounded_box(draw, boxes["upload"], fill=fills["storage"])
    centered_text(draw, boxes["upload"], "上传文件目录", font(24, bold=True))

    rounded_box(draw, boxes["export"], fill=fills["storage"])
    centered_text(draw, boxes["export"], "Excel 导出模块", font(24, bold=True))

    draw_arrow(draw, (350, 270), (500, 240))
    draw_label(draw, (430, 225), "登录 / 提交 / 查询", size=18)

    draw_arrow(draw, (350, 470), (500, 490))
    draw_label(draw, (430, 450), "审核 / 查询 / 轻量办理", size=18)

    draw_arrow(draw, (350, 670), (500, 490))
    draw_label(draw, (430, 610), "统计 / 配置 / 导出", size=18)

    draw_arrow(draw, (820, 240), (980, 330))
    draw_label(draw, (905, 250), "接口请求", size=18)

    draw_arrow(draw, (820, 490), (980, 370))
    draw_label(draw, (905, 475), "后台请求", size=18)

    draw_arrow(draw, (1320, 320), (1450, 200))
    draw_arrow(draw, (1320, 350), (1450, 380))
    draw_arrow(draw, (1320, 390), (1450, 560))

    draw_label(draw, (1390, 225), "结构化业务数据", size=17, anchor="lm")
    draw_label(draw, (1390, 405), "附件文件与访问地址", size=17, anchor="lm")
    draw_label(draw, (1390, 585), "统计报表与台账", size=17, anchor="lm")

    note = (500, 760, 1700, 1010)
    rounded_box(draw, note, radius=20, fill="#FFFFFF", outline="#D7CCC8", width=2)
    draw.text((535, 790), "说明：", font=font(24, bold=True), fill="#8D1B1B")
    bullets = [
        "1. 申请人以小程序为主；基层管理角色可在小程序轻量办理，也可进入后台处理审核与统计。",
        "2. 组织部和超级管理员以后台为主，不建议将复杂配置操作全部压到小程序端。",
        "3. 所有核心业务数据最终归集到服务端，再写入数据库、上传目录和导出模块。",
        "4. 当前数据流图用于汇报系统主链路，不代表全部异常处理、日志与备份链路已完整建设。",
    ]
    y = 835
    for bullet in bullets:
        draw.text((540, y), bullet, font=font(20), fill="#333333")
        y += 44

    img.save(OUT_DIR / "report-dfd.png", optimize=True)


def render_er():
    img = Image.new("RGB", (1800, 1260), "#FFF9F6")
    draw = ImageDraw.Draw(img)

    draw.text((72, 42), "核心 ER 图（汇报简版）", font=font(36, bold=True), fill="#8D1B1B")
    draw.text((72, 92), "用于说明当前系统是否已经具备继续建设的发展党员流程基础数据模型。", font=font(20), fill="#5F6368")

    entities = {
        "users": (70, 180, 360, 330, "USERS\n用户主表"),
        "roles": (70, 430, 360, 530, "ROLES\n角色"),
        "user_roles": (450, 430, 780, 530, "USER_ROLES\n用户角色关联"),
        "permissions": (900, 430, 1200, 530, "PERMISSIONS\n权限"),
        "role_permissions": (1290, 430, 1710, 530, "ROLE_PERMISSIONS\n角色权限关联"),
        "org_units": (450, 180, 760, 280, "ORG_UNITS\n二级单位"),
        "branches": (900, 180, 1200, 280, "BRANCHES\n党支部"),
        "registration_requests": (70, 610, 430, 720, "REGISTRATION_REQUESTS\n注册申请"),
        "applicant_profiles": (500, 610, 860, 720, "APPLICANT_PROFILES\n申请人资料"),
        "user_profiles": (930, 610, 1260, 720, "USER_PROFILES\n管理角色资料"),
        "wechat_bindings": (1330, 610, 1710, 720, "WECHAT_BINDINGS\n微信绑定"),
        "workflow_instances": (430, 840, 830, 940, "WORKFLOW_INSTANCES\n流程实例"),
        "step_records": (930, 840, 1310, 940, "WORKFLOW_STEP_RECORDS\n步骤记录"),
        "step_defs": (1400, 840, 1710, 940, "WORKFLOW_STEP_DEFINITIONS\n步骤定义"),
        "attachments": (930, 1040, 1230, 1140, "ATTACHMENTS\n附件"),
        "audit_logs": (1320, 1040, 1710, 1140, "AUDIT_LOGS\n审计日志"),
    }

    for key, box in entities.items():
        rounded_box(draw, box[:4], fill="#FFFFFF", outline="#B71C1C", width=2)
        centered_text(draw, box[:4], box[4], font(22, bold=True), fill="#202124")

    def connect(a, b, text, vertical=False):
        ax1, ay1, ax2, ay2, *_ = entities[a]
        bx1, by1, bx2, by2, *_ = entities[b]
        if vertical:
            start = ((ax1 + ax2) // 2, ay2)
            end = ((bx1 + bx2) // 2, by1)
            mid = ((start[0] + end[0]) // 2, (start[1] + end[1]) // 2)
        else:
            start = (ax2, (ay1 + ay2) // 2)
            end = (bx1, (by1 + by2) // 2)
            mid = ((start[0] + end[0]) // 2, (start[1] + end[1]) // 2 - 18)
        draw.line([start, end], fill="#8D1B1B", width=3)
        draw_label(draw, mid, text, size=16)

    connect("users", "org_units", "belongs to")
    connect("org_units", "branches", "contains")
    connect("roles", "user_roles", "assigned to")
    connect("user_roles", "permissions", "maps to")
    connect("permissions", "role_permissions", "governed by")
    connect("users", "registration_requests", "submits", vertical=True)
    connect("users", "applicant_profiles", "owns", vertical=True)
    connect("users", "user_profiles", "maintains", vertical=True)
    connect("users", "wechat_bindings", "binds", vertical=True)
    connect("applicant_profiles", "workflow_instances", "1:1", vertical=True)
    connect("workflow_instances", "step_records", "contains")
    connect("step_records", "step_defs", "defined by")
    connect("step_records", "attachments", "includes", vertical=True)
    connect("step_records", "audit_logs", "writes", vertical=True)
    connect("users", "audit_logs", "operates", False)

    note = (70, 980, 820, 1180)
    rounded_box(draw, note, radius=20, fill="#FFFFFF", outline="#D7CCC8", width=2)
    draw.text((105, 1012), "读图说明：", font=font(24, bold=True), fill="#8D1B1B")
    lines = [
        "1. 当前数据模型已经覆盖角色、组织、资料、流程、附件和审计等核心实体。",
        "2. 申请人资料与管理角色资料已经拆分，符合原始 Word 的资料口径差异要求。",
        "3. 流程采用“实例 + 步骤定义 + 步骤记录”方式，技术上适合承接 25 步长流程。",
        "4. 本图反映的是当前核心结构，不代表每个字段和每条业务规则都已完全固化。",
    ]
    y = 1055
    for line in lines:
        draw.text((110, y), line, font=font(19), fill="#333333")
        y += 38

    img.save(OUT_DIR / "report-er.png", optimize=True)


if __name__ == "__main__":
    render_dfd()
    render_er()
