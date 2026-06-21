import fs from 'fs';
import path from 'path';
import { sm2 } from 'sm-crypto';

// SM2 Keypair generated for local config password encryption
const SM2_PUBLIC_KEY = '048d844937029faa8b8f3e0a0672a0104130e8bf291c60f189864cb3915e62d43c0c5749ec8f5ee15accf373d78da2480b9ecc1580322adb8f4b95facba57e491e';
const SM2_PRIVATE_KEY = 'd678480c8dca492a7d876dbb8b857ff23ed87fe869f4372ffb389c9b7f4598fb';

function encryptPassword(plainText: string): string {
  if (!plainText) return '';
  // Avoid double encryption: if it starts with 'sm2:' prefix, it is already encrypted
  if (plainText.startsWith('sm2:')) return plainText;
  try {
    const cipherText = sm2.doEncrypt(plainText, SM2_PUBLIC_KEY, 1); // 1 = C1C3C2 mode
    return `sm2:${cipherText}`;
  } catch (err) {
    console.error("SM2 encryption failed:", err);
    return plainText;
  }
}

function decryptPassword(cipherText: string): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith('sm2:')) return cipherText; // Plain text fallback
  try {
    const rawCipher = cipherText.substring(4);
    return sm2.doDecrypt(rawCipher, SM2_PRIVATE_KEY, 1); // 1 = C1C3C2 mode
  } catch (err) {
    console.error("SM2 decryption failed, returning raw cipher:", err);
    return cipherText;
  }
}

const CONFIG_FILE = path.join(process.cwd(), 'data', 'semantic_config.json');

export interface DataSource {
  name: string;
  connector: string;
  properties: Record<string, string>;
}

export interface FieldOverride {
  logical_name?: string;
  description?: string;
}

export interface Scenario {
  code: string;
  name: string;
  description: string;
  global_rules: string;
  catalogs: string[];
  tables: string[];
  table_overrides?: Record<string, string>; // table_name -> description
  field_overrides?: Record<string, Record<string, FieldOverride>>; // table_name -> column_name -> override
}

export interface ConfigData {
  datasources: DataSource[];
  scenarios: Scenario[];
}

const DEFAULT_CONFIG: ConfigData = {
  datasources: [
    {
      name: "postgresql",
      connector: "postgresql",
      properties: {
        "connection-url": "jdbc:postgresql://localhost:5432/postgres",
        "connection-user": "postgres",
        "connection-password": "postgres"
      }
    },
    {
      name: "mysql",
      connector: "mysql",
      properties: {
        "connection-url": "jdbc:mysql://localhost:3306/",
        "connection-user": "root",
        "connection-password": "root"
      }
    }
  ],
  scenarios: [
    {
      code: "finance",
      name: "财务分析场景",
      description: "分析销售额、净利润、订单详情以及用户行为，用于财务核算与转化分析。",
      global_rules: "1. 涉及金额计算时，销售净额计算公式默认统一为 price * qty - discount。\n2. 查询年度数据时，默认使用当前年份进行过滤。",
      catalogs: ["postgresql", "mysql"],
      tables: [
        "postgresql.public.orders",
        "mysql.mysql_db.brands"
      ],
      table_overrides: {
        "postgresql.public.orders": "订单表，包含销售核心字段"
      },
      field_overrides: {
        "postgresql.public.orders": {
          "order_id": {
            "logical_name": "订单ID",
            "description": "主键，唯一订单号"
          },
          "price": {
            "logical_name": "单价",
            "description": "商品的销售单价"
          }
        }
      }
    }
  ]
};

// Ensure directory exists
const dir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readConfig(): ConfigData {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      writeConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content) as ConfigData;

    // Decrypt passwords when reading configuration
    if (config.datasources) {
      config.datasources.forEach(ds => {
        if (ds.properties && ds.properties['connection-password']) {
          ds.properties['connection-password'] = decryptPassword(ds.properties['connection-password']);
        }
      });
    }

    return config;
  } catch (err) {
    console.error("Failed to read config file, using fallback default:", err);
    return DEFAULT_CONFIG;
  }
}

export function writeConfig(config: ConfigData): void {
  try {
    // Deep copy to prevent modifying the runtime in-memory representation
    const configCopy = JSON.parse(JSON.stringify(config)) as ConfigData;

    // Encrypt passwords before writing to semantic_config.json
    if (configCopy.datasources) {
      configCopy.datasources.forEach(ds => {
        if (ds.properties && ds.properties['connection-password']) {
          ds.properties['connection-password'] = encryptPassword(ds.properties['connection-password']);
        }
      });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configCopy, null, 2), 'utf-8');
  } catch (err) {
    console.error("Failed to write config file:", err);
  }
}
