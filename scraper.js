// ============================================================================
// AWB Scraper Class - Data Fetching & HTML Parsing
// ============================================================================
// Purpose: Fetch HTML from GMR/DCSC websites and extract table data
// Services: 
//   - DCSC (Delhi Cargo Service Centre) - POST request with SSL disabled
//   - GMR (GMR Cargo Tracking) - GET request with URL parameters
// ============================================================================

const axios = require('axios');
const cheerio = require('cheerio');

class AWBScraper {
    constructor(awbNumber, serviceOption) {
        this.awbNumber = awbNumber.trim();
        this.serviceOption = serviceOption;

        // Service mapping: '1' = DCSC, '2' = GMR
        this.serviceOptions = {
            '1': 'DCSC - Delhi Cargo Service Centre',
            '2': 'GMR ARGO - Cargo Tracking'
        };

        // Base URLs for each service
        this.baseUrls = {
            '1': 'https://dcsc.in:7002/DCSC_webportal/GetAWBExportTracking.do',
            '2': 'https://international.gmrgroup.in/TrackAndTrace/CARGO/CargoTrackingdetailBeforeLogin.aspx'
        };

        // Common HTTP headers for requests
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded'
        };
    }

    // ========================================================================
    // Split AWB Number into Prefix (3 digits) and Number (remaining digits)
    // ========================================================================
    // Example: 05700359741 → prefix: '057', number: '00359741'
    splitAwbNumber(awb) {
        // Remove non-digit characters
        const cleanAwb = awb.replace(/[^0-9]/g, '');
        
        if (cleanAwb.length >= 4) {
            const prefix = cleanAwb.substring(0, 3);      // First 3 digits
            const number = cleanAwb.substring(3);         // Remaining digits
            return { prefix, number };
        }
        return { prefix: '', number: cleanAwb };
    }

    // ========================================================================
    // Fetch HTML from Service Website
    // ========================================================================
    async fetchHTML() {
        try {
            const baseUrl = this.baseUrls[this.serviceOption];

            if (this.serviceOption === '1') {
                // ============================================================
                // DCSC - POST Request with Form Data
                // ============================================================
                const { prefix, number } = this.splitAwbNumber(this.awbNumber);
                
                const formData = new URLSearchParams();
                formData.append('awbpfx', prefix);
                formData.append('cod_awb_num', number);

                console.log(`   DCSC URL: ${baseUrl}`);
                console.log(`   AWB Prefix: ${prefix}, Number: ${number}`);
                console.log(`   Payload: ${formData.toString()}`);

                // SSL configuration - Disable verification for DCSC
                const https = require('https');
                const httpsAgent = new https.Agent({
                    rejectUnauthorized: false,          // Equivalent to CURLOPT_SSL_VERIFYPEER = false
                    checkServerIdentity: () => undefined // Equivalent to CURLOPT_SSL_VERIFYHOST = false
                });

                const response = await axios.post(baseUrl, formData.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    httpsAgent: httpsAgent,
                    timeout: 20000,
                    maxRedirects: 10,
                    followRedirect: true
                });

                console.log(`   Response length: ${response.data.length} bytes`);
                return response.data;

            } else if (this.serviceOption === '2') {
                // ============================================================
                // GMR - GET Request with URL Parameters
                // ============================================================
                const { prefix, number } = this.splitAwbNumber(this.awbNumber);
                const url = `${baseUrl}?awbpfx=${prefix}&cod_awb_num=${number}&pageno=0&VTSrno=0&totVT=0`;

                console.log(`   Fetching: ${url}`);

                const response = await axios.get(url, {
                    headers: {
                        ...this.headers,
                        'Referer': 'https://international.gmrgroup.in/TrackAndTrace/UserLogin/tnt.aspx'
                    },
                    timeout: 20000,
                    maxRedirects: 5
                });

                return response.data;
            }

        } catch (error) {
            console.error('   Error fetching data:', error.message);
            return null;
        }
    }

    // ========================================================================
    // Parse HTML and Extract All Tables
    // ========================================================================
    parseHTML(htmlContent) {
        const $ = cheerio.load(htmlContent);

        const data = {
            awb_number: this.awbNumber,
            service: this.serviceOptions[this.serviceOption],
            extraction_time: new Date().toISOString(),
            all_tables: []
        };

        // Iterate through all <table> elements in HTML
        let tableIndex = 0;
        $('table').each((idx, table) => {
            const $table = $(table);
            const tableId = $table.attr('id') || `table_${tableIndex}`;

            const rows = [];
            
            // Extract all rows from table
            $table.find('tr').each((rowIdx, row) => {
                const cells = [];
                
                // Extract cells (td and th elements)
                $(row).find('td, th').each((cellIdx, cell) => {
                    const text = $(cell).text().trim();
                    if (text) {
                        cells.push({
                            text: text,
                            isHeader: cell.name === 'th'  // Flag if cell is a header
                        });
                    }
                });

                // Add row if it has cells
                if (cells.length > 0) {
                    rows.push({
                        row_number: rowIdx,
                        cells: cells
                    });
                }
            });

            // Add table to results if it has rows
            if (rows.length > 0) {
                data.all_tables.push({
                    table_number: tableIndex,
                    table_id: tableId,
                    total_rows: rows.length,
                    rows: rows
                });
                tableIndex++;
            }
        });

        return data;
    }

    // ========================================================================
    // Main Scraping Method
    // ========================================================================
    async scrape() {
        // Step 1: Fetch HTML from website
        const html = await this.fetchHTML();
        if (!html) {
            console.error('   Failed to fetch HTML');
            return null;
        }

        // Step 2: Parse HTML and extract tables
        const data = this.parseHTML(html);
        return data;
    }
}

module.exports = AWBScraper;
