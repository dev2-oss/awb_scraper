// ============================================================================
// AWB Data Scraper - Backend API Server
// ============================================================================
// Purpose: Fetch cargo tracking data from GMR and DCSC websites
// Architecture: API handles data fetching, UI handles parsing & display
// ============================================================================

const express = require('express');
const cors = require('cors');
const AWBScraper = require('./scraper.js');

const app = express();
const PORT = 3001;

// Middleware setup
app.use(cors());              // Enable CORS for frontend communication
app.use(express.json());      // Parse JSON request bodies

// ============================================================================
// Health Check Endpoint
// ============================================================================
// GET /api/health - Check if server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// ============================================================================
// Main Scraping Endpoint
// ============================================================================
// POST /api/scrape - Fetch cargo tracking data from GMR or DCSC
// Request Body: { service: 'gmr' | 'dcsc', awbNumber: '05700359741' }
// Response: Raw table data (rows array) for UI to parse
app.post('/api/scrape', async (req, res) => {
  try {
    // Extract request parameters
    const { service, awbNumber } = req.body;

    // Validate AWB number
    if (!awbNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'AWB number is required' 
      });
    }

    // Map service name to option code
    // '1' = DCSC (Delhi Cargo Service Centre)
    // '2' = GMR (GMR Cargo Tracking)
    const serviceOption = service === 'gmr' ? '2' : '1';

    console.log(`\n📦 Scraping request received:`);
    console.log(`   Service: ${service} (${serviceOption})`);
    console.log(`   AWB: ${awbNumber}`);

    // Initialize scraper and fetch data
    const scraper = new AWBScraper(awbNumber, serviceOption);
    const data = await scraper.scrape();

    if (!data) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to scrape data. Please check AWB number and try again.' 
      });
    }

    // Check if DCSC returned "No Data Found" error
    if (serviceOption === '1' && data.all_tables.length === 0) {
      const htmlStr = JSON.stringify(data);
      if (htmlStr.includes('No Data Found')) {
        return res.status(404).json({
          success: false,
          error: 'No Data Found for this AWB number in DCSC system. Please verify the AWB number.',
          service: 'DCSC',
          awb_number: awbNumber
        });
      }
    }

    let url = '';
    if (serviceOption === '2') {
      const { prefix, number } = scraper.splitAwbNumber(awbNumber);
      url = `https://international.gmrgroup.in/TrackAndTrace/CARGO/CargoTrackingdetailBeforeLogin.aspx?awbpfx=${prefix}&cod_awb_num=${number}&pageno=0&VTSrno=0&totVT=0`;
    } else {
      const { prefix, number } = scraper.splitAwbNumber(awbNumber);
      url = `https://dcsc.in:7002/DCSC_webportal/GetAWBExportTracking.do (POST: awbpfx=${prefix}, cod_awb_num=${number})`;
    }

    console.log(`✅ Scraping successful!`);
    console.log(`   Tables extracted: ${data.all_tables.length}`);
    console.log(`   URL: ${url}\n`);

    // API ka kaam: Sirf tables extract karke send karo
    // UI ka kaam: Tables ko parse karke display karo
    
    // Filter useful tables based on service
    let usefulTables;
    if (serviceOption === '2') {
      // GMR: Only Grid* tables
      usefulTables = data.all_tables.filter(table => {
        return table.table_id.startsWith('Grid') || table.table_id.startsWith('grd');
      });
    } else {
      // DCSC: First main table only
      usefulTables = data.all_tables.length > 0 ? [data.all_tables[0]] : [];
    }

    // Simple response - bas raw table data with rows
    const responseData = {
      awb_number: data.awb_number,
      service_name: data.service,
      service_code: serviceOption,
      extraction_time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      total_tables: usefulTables.length,
      tables: usefulTables.map((table, idx) => ({
        table_id: table.table_id,
        table_number: idx + 1,
        total_rows: table.rows.length,
        rows: table.rows.map(row => row.cells.map(cell => cell.text))
      }))
    };

    res.json({
      success: true,
      data: responseData,
      url: url
    });

  } catch (error) {
    console.error('❌ Server error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 AWB Scraper Server Running`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/scrape`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`${'='.repeat(60)}\n`);
});
