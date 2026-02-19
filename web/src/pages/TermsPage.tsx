import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>使用条款</h1>
        <p style={styles.updated}>最后更新: 2026 年 2 月</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. 服务说明</h2>
          <p style={styles.p}>
            灵（Ling）是一个 AI 数字人对话平台。使用本服务即表示您同意以下条款。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. 用户责任</h2>
          <ul style={styles.ul}>
            <li>您必须年满 16 周岁方可使用本服务</li>
            <li>您需对自己的账户安全负责</li>
            <li>禁止使用本服务生成有害、违法或侵权内容</li>
            <li>禁止尝试绕过服务限制或进行滥用</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. AI 生成内容免责</h2>
          <p style={styles.p}>
            灵是 AI 系统，其回复仅供参考，不构成专业建议。灵不提供医疗、法律或财务建议。
            AI 生成的内容可能不完全准确，请自行判断。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. 付费与退款</h2>
          <p style={styles.p}>
            付费订阅通过 Stripe 处理。积分购买为一次性消费，原则上不支持退款。
            订阅可随时取消，取消后当前周期内仍可使用。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. 数据与隐私</h2>
          <p style={styles.p}>
            我们重视您的隐私。您可以随时在账户设置中导出或删除您的数据。
            详细隐私政策请参见我们的隐私声明。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>6. 服务变更</h2>
          <p style={styles.p}>
            我们保留随时修改服务内容和条款的权利。重大变更会通过注册邮箱通知。
          </p>
        </section>

        <div style={styles.back}>
          <Link to="/" style={styles.link}>返回首页</Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    minHeight: '100dvh',
    background: '#0a0015',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    maxWidth: 640,
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#c4b5fd',
    marginBottom: 4,
  },
  updated: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginBottom: 32,
  },
  section: { marginBottom: 28 },
  h2: {
    fontSize: 18,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  p: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: '1.7',
    margin: 0,
  },
  ul: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: '1.7',
    paddingLeft: 20,
    margin: 0,
  },
  back: { marginTop: 40, textAlign: 'center' },
  link: { color: '#c4b5fd', textDecoration: 'none', fontSize: 14 },
};
