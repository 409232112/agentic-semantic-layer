# MySQL + PostgreSQL 跨库联邦查询与语义层测试用例

本指南提供了三个典型的跨库（MySQL + PostgreSQL）联邦查询场景，用于验证 Trino 语义层的联邦查询、过滤和分析能力。

---

## 准备工作 (数据源映射配置)

在执行以下查询前，请确保在 Trino 中已经配置了这两个数据源对应的 Catalog：
*   **PostgreSQL Catalog**: 命名为 `postgresql`
*   **MySQL Catalog**: 命名为 `mysql`

---

## 场景一：电商跨库客户与订单消费分析

### 1. 业务背景
客户档案和画像级别数据存储在 CRM 系统（运行在 **PostgreSQL** 上，便于处理半结构化数据和复杂画像关系），而高频订单交易明细存储在交易系统（运行在 **MySQL** 上，便于高并发事务写入）。
*   **PostgreSQL 表**: `crm_customers` (存储客户基础信息与客户等级)
*   **MySQL 表**: `mall_orders` (存储订单金额、支付状态及下单时间)

### 2. 建表 DDL 与数据初始化

#### PostgreSQL (CRM 库)
```sql
-- 创建客户表
CREATE TABLE crm_customers (
    customer_id INT PRIMARY KEY,
    name VARCHAR(50),
    email VARCHAR(100),
    level VARCHAR(20), -- 'Bronze', 'Silver', 'Gold', 'Platinum'
    register_date DATE
);

-- 插入测试数据
INSERT INTO crm_customers VALUES (101, '张伟', 'zhangwei@example.com', 'Gold', '2025-01-10');
INSERT INTO crm_customers VALUES (102, '王芳', 'wangfang@example.com', 'Platinum', '2025-02-15');
INSERT INTO crm_customers VALUES (103, '李娜', 'lina@example.com', 'Silver', '2025-03-20');
INSERT INTO crm_customers VALUES (104, '刘洋', 'liuyang@example.com', 'Bronze', '2025-04-25');
INSERT INTO crm_customers VALUES (105, '陈静', 'chenjing@example.com', 'Gold', '2025-05-12');
```

#### MySQL (Mall 库)
```sql
-- 创建订单表
CREATE TABLE mall_orders (
    order_id INT PRIMARY KEY,
    customer_id INT,
    total_amount DECIMAL(10, 2),
    order_status VARCHAR(20), -- 'COMPLETED', 'PENDING', 'CANCELLED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入测试数据
INSERT INTO mall_orders VALUES (1001, 101, 1200.50, 'COMPLETED', '2026-06-01 10:00:00');
INSERT INTO mall_orders VALUES (1002, 101, 850.00, 'COMPLETED', '2026-06-05 14:30:00');
INSERT INTO mall_orders VALUES (1003, 102, 3500.00, 'COMPLETED', '2026-06-10 09:15:00');
INSERT INTO mall_orders VALUES (1004, 103, 450.00, 'PENDING', '2026-06-12 11:20:00');
INSERT INTO mall_orders VALUES (1005, 104, 150.00, 'CANCELLED', '2026-06-15 16:45:00');
INSERT INTO mall_orders VALUES (1006, 105, 990.00, 'COMPLETED', '2026-06-18 18:22:00');
INSERT INTO mall_orders VALUES (1007, 102, 120.00, 'COMPLETED', '2026-06-19 12:00:00');
```

### 3. 测试问答

*   **提问**：
    > "展示所有已完成订单中，总消费金额最高的前 3 名客户的姓名、客户级别以及他们的总消费金额。"

*   **预期的 Trino 联邦 SQL**：
    ```sql
    SELECT 
        c.name AS customer_name,
        c.level AS customer_level,
        SUM(o.total_amount) AS total_spent
    FROM postgresql.public.crm_customers c
    JOIN mysql.db.mall_orders o ON c.customer_id = o.customer_id
    WHERE o.order_status = 'COMPLETED'
    GROUP BY c.name, c.level
    ORDER BY total_spent DESC
    LIMIT 3;
    ```

*   **预期输出结果**：

    | customer_name | customer_level | total_spent |
    | :--- | :--- | :--- |
    | 王芳 | Platinum | 3620.00 |
    | 张伟 | Gold | 2050.50 |
    | 陈静 | Gold | 990.00 |

---

## 场景二：HR 绩效评级与财务薪酬匹配分析

### 1. 业务背景
员工基本档案和季度绩效考核等级存储在 HR 人事管理数据库（运行在 **MySQL**），而敏感的工资发放明细和年终奖明细存储在财务系统（运行在 **PostgreSQL**，以确保数据安全）。
*   **MySQL 表**: `hr_employees` (存储员工姓名、部门、考评等级)
*   **PostgreSQL 表**: `fin_payroll` (存储月基本薪资、奖金)

### 2. 建表 DDL 与数据初始化

#### MySQL (HR 库)
```sql
-- 创建员工与绩效表
CREATE TABLE hr_employees (
    emp_id INT PRIMARY KEY,
    name VARCHAR(50),
    department VARCHAR(50),
    performance_rating CHAR(1) -- 'A', 'B', 'C', 'D'
);

-- 插入测试数据
INSERT INTO hr_employees VALUES (1, '赵雷', '研发部', 'A');
INSERT INTO hr_employees VALUES (2, '钱电', '市场部', 'B');
INSERT INTO hr_employees VALUES (3, '孙风', '研发部', 'A');
INSERT INTO hr_employees VALUES (4, '李云', '财务部', 'C');
INSERT INTO hr_employees VALUES (5, '周雨', '市场部', 'A');
```

#### PostgreSQL (Finance 库)
```sql
-- 创建薪酬发放表
CREATE TABLE fin_payroll (
    payroll_id INT PRIMARY KEY,
    emp_id INT,
    base_salary DECIMAL(12, 2),
    bonus DECIMAL(12, 2),
    pay_date DATE
);

-- 插入测试数据
INSERT INTO fin_payroll VALUES (2001, 1, 15000.00, 5000.00, '2026-06-01');
INSERT INTO fin_payroll VALUES (2002, 2, 12000.00, 3000.00, '2026-06-01');
INSERT INTO fin_payroll VALUES (2003, 3, 18000.00, 6000.00, '2026-06-01');
INSERT INTO fin_payroll VALUES (2004, 4, 10000.00, 1000.00, '2026-06-01');
INSERT INTO fin_payroll VALUES (2005, 5, 14000.00, 4500.00, '2026-06-01');
```

### 3. 测试问答

*   **提问**：
    > "对于考评等级为 'A' 的优秀员工，计算各部门的平均基本工资和平均奖金。"

*   **预期的 Trino 联邦 SQL**：
    ```sql
    SELECT 
        e.department,
        ROUND(AVG(p.base_salary), 2) AS avg_base_salary,
        ROUND(AVG(p.bonus), 2) AS avg_bonus,
        COUNT(e.emp_id) AS employee_count
    FROM mysql.db.hr_employees e
    JOIN postgresql.public.fin_payroll p ON e.emp_id = p.emp_id
    WHERE e.performance_rating = 'A'
    GROUP BY e.department
    ORDER BY avg_base_salary DESC;
    ```

*   **预期输出结果**：

    | department | avg_base_salary | avg_bonus | employee_count |
    | :--- | :--- | :--- | :--- |
    | 研发部 | 16500.00 | 5500.00 | 2 |
    | 市场部 | 14000.00 | 4500.00 | 1 |

---

## 场景三：IoT 设备台账与监控指标告警分析

### 1. 业务背景
物联网设备的基本出厂台账（设备型号、部署地点、厂商等）存放在 **MySQL** 资产管理表中；而设备采集的实时遥测温度和湿度指标通过流处理引擎快速汇入 **PostgreSQL**（时间序列存储）。
*   **MySQL 表**: `asset_registry` (设备台账 and 部署地点)
*   **PostgreSQL 表**: `device_telemetry` (温度、湿度等指标流)

### 2. 建表 DDL 与数据初始化

#### MySQL (Asset 库)
```sql
-- 创建设备台账表
CREATE TABLE asset_registry (
    device_sn VARCHAR(50) PRIMARY KEY,
    device_type VARCHAR(30), -- 'Sensor', 'Gateway', 'Controller'
    installation_site VARCHAR(100),
    status VARCHAR(20)
);

-- 插入测试数据
INSERT INTO asset_registry VALUES ('SN-001', 'Sensor', '机房A栋一楼', 'ACTIVE');
INSERT INTO asset_registry VALUES ('SN-002', 'Sensor', '机房A栋二楼', 'ACTIVE');
INSERT INTO asset_registry VALUES ('SN-003', 'Gateway', '机房B栋一楼', 'ACTIVE');
INSERT INTO asset_registry VALUES ('SN-004', 'Sensor', '动力机房C栋', 'ACTIVE');
INSERT INTO asset_registry VALUES ('SN-005', 'Sensor', '配电间D栋', 'MAINTENANCE');
```

#### PostgreSQL (IoT 库)
```sql
-- 创建遥测指标表
CREATE TABLE device_telemetry (
    id SERIAL PRIMARY KEY,
    device_sn VARCHAR(50),
    temperature NUMERIC(5, 2),
    humidity NUMERIC(5, 2),
    recorded_at TIMESTAMP WITHOUT TIME ZONE
);

-- 插入测试数据
INSERT INTO device_telemetry (device_sn, temperature, humidity, recorded_at) VALUES ('SN-001', 75.2, 45.0, '2026-06-21 10:00:00');
INSERT INTO device_telemetry (device_sn, temperature, humidity, recorded_at) VALUES ('SN-001', 82.5, 42.1, '2026-06-21 10:10:00');
INSERT INTO device_telemetry (device_sn, temperature, humidity, recorded_at) VALUES ('SN-002', 68.0, 50.2, '2026-06-21 10:00:00');
INSERT INTO device_telemetry (device_sn, temperature, humidity, recorded_at) VALUES ('SN-003', 45.0, 30.0, '2026-06-21 10:00:00');
INSERT INTO device_telemetry (device_sn, temperature, humidity, recorded_at) VALUES ('SN-004', 88.4, 40.5, '2026-06-21 10:15:00');
INSERT INTO device_telemetry (device_sn, temperature, humidity, recorded_at) VALUES ('SN-005', 92.1, 38.0, '2026-06-21 10:20:00'); -- 该设备状态为维护中
```

### 3. 测试问答

*   **提问**：
    > "哪些部署地点的运行状态为 'ACTIVE' 且类型为 'Sensor' 的设备上报过大于 80 摄氏度的高温？请列出这些地点的名称以及该设备录得的最高温度。"

*   **预期的 Trino 联邦 SQL**：
    ```sql
    SELECT 
        a.installation_site,
        a.device_sn,
        MAX(t.temperature) AS max_temperature
    FROM mysql.db.asset_registry a
    JOIN postgresql.public.device_telemetry t ON a.device_sn = t.device_sn
    WHERE a.device_type = 'Sensor' 
      AND a.status = 'ACTIVE' 
      AND t.temperature > 80.0
    GROUP BY a.installation_site, a.device_sn
    ORDER BY max_temperature DESC;
    ```

*   **预期输出结果**：

    | installation_site | device_sn | max_temperature |
    | :--- | :--- | :--- |
    | 动力机房C栋 | SN-004 | 88.40 |
    | 机房A栋一楼 | SN-001 | 82.50 |
