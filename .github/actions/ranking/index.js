import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { createClient } from 'microcms-js-sdk';

// デバッグ用関数を追加
const debugLog = (title, data) => {
  console.log(`\n=== ${title} ===`);
  if (typeof data === 'object') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
  console.log('========================\n');
};

const client = createClient({
  serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
  apiKey: process.env.MICROCMS_PATCH_API_KEY,
});

const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '');
const analyticsDataClient = new BetaAnalyticsDataClient({
  credentials: {
    client_email: serviceAccountKey.client_email,
    private_key: serviceAccountKey.private_key,
  },
});

// 全ページのデータ取得用のデバッグ関数
const debugAllPagesData = async () => {
  debugLog('全ページデータ取得開始', '期間: 8daysAgo から 1daysAgo');

  try {
    const [allPagesResponse] = await analyticsDataClient.runReport({
      property: `properties/${process.env.GA_PROPERTY_ID}`,
      dateRanges: [
        {
          startDate: '8daysAgo',
          endDate: '1daysAgo',
        },
      ],
      dimensions: [
        {
          name: 'pagePath',
        },
      ],
      metrics: [
        {
          name: 'screenPageViews',
        },
      ],
      limit: '15',
    });

    const allPagesData = {
      totalPages: allPagesResponse.rows?.length || 0,
      pages:
        allPagesResponse.rows?.slice(0, 10).map((row, index) => ({
          rank: index + 1,
          path: row.dimensionValues?.[0].value,
          views: row.metricValues?.[0].value,
        })) || [],
    };

    debugLog('全ページデータ結果', allPagesData);
    return allPagesData;
  } catch (error) {
    debugLog('全ページデータ取得エラー', error.message);
    return null;
  }
};

// 30日間のデータ取得用のデバッグ関数
const debug30DaysData = async () => {
  debugLog('30日間データ取得開始', '期間: 30daysAgo から 1daysAgo');

  try {
    const [response30Days] = await analyticsDataClient.runReport({
      property: `properties/${process.env.GA_PROPERTY_ID}`,
      dateRanges: [
        {
          startDate: '30daysAgo',
          endDate: '1daysAgo',
        },
      ],
      dimensions: [
        {
          name: 'pagePath',
        },
      ],
      metrics: [
        {
          name: 'screenPageViews',
        },
      ],
      limit: '15',
    });

    const data30Days = {
      totalPages: response30Days.rows?.length || 0,
      pages:
        response30Days.rows?.slice(0, 10).map((row, index) => ({
          rank: index + 1,
          path: row.dimensionValues?.[0].value,
          views: row.metricValues?.[0].value,
        })) || [],
    };

    debugLog('30日間データ結果', data30Days);
    return data30Days;
  } catch (error) {
    debugLog('30日間データ取得エラー', error.message);
    return null;
  }
};

export const getPopularArticles = async () => {
  debugLog('処理開始', {
    propertyId: process.env.GA_PROPERTY_ID,
    serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
    timestamp: new Date().toISOString(),
  });

  // デバッグ用データ取得
  await debugAllPagesData();
  await debug30DaysData();

  debugLog('articles配下データ取得開始', 'フィルター: ^/articles/[^/]+$');

  const [response] = await analyticsDataClient.runReport({
    property: `properties/${process.env.GA_PROPERTY_ID}`,
    dateRanges: [
      {
        startDate: '8daysAgo',
        endDate: '1daysAgo',
      },
    ],
    dimensions: [
      {
        name: 'pagePath',
      },
    ],
    metrics: [
      {
        name: 'screenPageViews',
      },
    ],
    // articles/配下のみを計測する
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          matchType: 'FULL_REGEXP',
          value: '^/articles/[^/]+$',
        },
      },
    },
    limit: '5',
  });

  debugLog('articles配下生データ', {
    rowsCount: response.rows?.length || 0,
    rawRows: response.rows || [],
  });

  const data = response.rows?.map((row) => {
    return {
      path: row.dimensionValues?.[0].value,
      views: row.metricValues?.[0].value,
    };
  });

  debugLog('articles配下整形データ', data);
  return data;
};

// メイン処理開始
debugLog('環境変数確認', {
  hasServiceDomain: !!process.env.MICROCMS_SERVICE_DOMAIN,
  hasApiKey: !!process.env.MICROCMS_PATCH_API_KEY,
  hasGoogleKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  hasPropertyId: !!process.env.GA_PROPERTY_ID,
});

const popularArticles = (await getPopularArticles()) || [];
debugLog('人気記事取得結果', popularArticles);

// /articles/ は除くため10文字削る
const ids = popularArticles.map((article) => article.path.slice(10));
debugLog('記事ID抽出結果', ids);

debugLog('microCMS更新開始', {
  endpoint: 'ranking',
  articleIds: ids,
});

await client.update({
  endpoint: 'ranking',
  content: {
    articles: ids,
  },
});

debugLog('処理完了', '全ての処理が正常に完了しました');
