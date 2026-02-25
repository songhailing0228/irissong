const axios = require('axios');

const FEISHU_HOST = 'https://open.feishu.cn/open-apis';

class FeishuService {
  constructor() {
    this.tenantToken = null;
    this.tokenExpiry = 0;
  }

  async getTenantAccessToken() {
    if (this.tenantToken && Date.now() < this.tokenExpiry) {
      return this.tenantToken;
    }

    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET must be set in .env');
    }

    const res = await axios.post(`${FEISHU_HOST}/auth/v3/tenant_access_token/internal`, {
      app_id: appId,
      app_secret: appSecret
    });

    if (res.data.code !== 0) {
      throw new Error(`Feishu auth failed: ${res.data.msg}`);
    }

    this.tenantToken = res.data.tenant_access_token;
    this.tokenExpiry = Date.now() + (res.data.expire - 300) * 1000;
    return this.tenantToken;
  }

  parseFeishuUrl(url) {
    // https://xxx.feishu.cn/wiki/ABC123
    // https://xxx.feishu.cn/docx/ABC123
    // https://xxx.feishu.cn/docs/ABC123
    const wikiMatch = url.match(/\/wiki\/([a-zA-Z0-9]+)/);
    if (wikiMatch) return { type: 'wiki', token: wikiMatch[1] };

    const docxMatch = url.match(/\/docx\/([a-zA-Z0-9]+)/);
    if (docxMatch) return { type: 'docx', token: docxMatch[1] };

    const docsMatch = url.match(/\/docs\/([a-zA-Z0-9]+)/);
    if (docsMatch) return { type: 'docs', token: docsMatch[1] };

    return null;
  }

  async resolveWikiToDocToken(wikiToken) {
    const token = await this.getTenantAccessToken();
    const res = await axios.get(`${FEISHU_HOST}/wiki/v2/spaces/get_node`, {
      params: { token: wikiToken },
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.code !== 0) {
      throw new Error(`Failed to resolve wiki node: ${res.data.msg}`);
    }

    const node = res.data.data.node;
    return { objToken: node.obj_token, objType: node.obj_type };
  }

  async fetchDocContent(docToken) {
    const token = await this.getTenantAccessToken();

    const res = await axios.get(`${FEISHU_HOST}/docx/v1/documents/${docToken}/raw_content`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.code !== 0) {
      throw new Error(`Failed to fetch document: ${res.data.msg}`);
    }

    return res.data.data.content;
  }

  async fetchDocBlocks(docToken) {
    const token = await this.getTenantAccessToken();
    let allBlocks = [];
    let pageToken = '';

    do {
      const res = await axios.get(`${FEISHU_HOST}/docx/v1/documents/${docToken}/blocks`, {
        params: { page_size: 500, page_token: pageToken || undefined },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.code !== 0) {
        throw new Error(`Failed to fetch blocks: ${res.data.msg}`);
      }

      allBlocks = allBlocks.concat(res.data.data.items || []);
      pageToken = res.data.data.page_token;
    } while (pageToken);

    return this.blocksToText(allBlocks);
  }

  blocksToText(blocks) {
    const lines = [];
    for (const block of blocks) {
      const text = this.extractBlockText(block);
      if (text) lines.push(text);
    }
    return lines.join('\n');
  }

  extractBlockText(block) {
    const type = block.block_type;

    const getText = (elements) => {
      if (!elements) return '';
      return elements.map(el => {
        if (el.text_run) return el.text_run.content;
        if (el.mention_user) return `@user`;
        if (el.mention_doc) return `[doc]`;
        return '';
      }).join('');
    };

    switch (type) {
      case 2: // text
        return getText(block.text?.elements);
      case 3: // heading1
        return `# ${getText(block.heading1?.elements)}`;
      case 4: // heading2
        return `## ${getText(block.heading2?.elements)}`;
      case 5: // heading3
        return `### ${getText(block.heading3?.elements)}`;
      case 6: // heading4
        return `#### ${getText(block.heading4?.elements)}`;
      case 7: // heading5
        return `##### ${getText(block.heading5?.elements)}`;
      case 8: // heading6
        return `###### ${getText(block.heading6?.elements)}`;
      case 9: // heading7
        return getText(block.heading7?.elements);
      case 10: // heading8
        return getText(block.heading8?.elements);
      case 11: // heading9
        return getText(block.heading9?.elements);
      case 12: // bullet
        return `• ${getText(block.bullet?.elements)}`;
      case 13: // ordered
        return `- ${getText(block.ordered?.elements)}`;
      case 14: // code
        return `\`\`\`\n${getText(block.code?.elements)}\n\`\`\``;
      case 15: // quote
        return `> ${getText(block.quote?.elements)}`;
      case 17: // todo
        return `[ ] ${getText(block.todo?.elements)}`;
      case 22: // divider
        return '---';
      case 23: { // image
        const imgToken = block.image?.token;
        return imgToken ? `[IMAGE:${imgToken}]` : '[图片：无法获取]';
      }
      case 27: // table
        return '[Table]';
      default:
        return '';
    }
  }

  async downloadImage(fileToken) {
    const token = await this.getTenantAccessToken();
    const res = await axios.get(`${FEISHU_HOST}/drive/v1/medias/${fileToken}/download`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
    });
    const contentType = res.headers['content-type'] || 'image/png';
    const base64 = Buffer.from(res.data).toString('base64');
    return { base64, contentType };
  }

  async fetchDocument(url) {
    const parsed = this.parseFeishuUrl(url);
    if (!parsed) {
      throw new Error(`Unsupported Feishu URL format: ${url}`);
    }

    let docToken;

    if (parsed.type === 'wiki') {
      const resolved = await this.resolveWikiToDocToken(parsed.token);
      docToken = resolved.objToken;
    } else {
      docToken = parsed.token;
    }

    try {
      return await this.fetchDocBlocks(docToken);
    } catch (e) {
      console.warn('Block API failed, trying raw_content:', e.message);
      return await this.fetchDocContent(docToken);
    }
  }
}

module.exports = new FeishuService();
