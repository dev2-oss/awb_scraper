import { useState } from 'react'
import './App.css'

function App() {
  const [service, setService] = useState('gmr')
  const [awbNumber, setAwbNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  // UI parsing logic - API se raw data aata hai, yahan parse karte hain
  const parseTableData = (rawData) => {
    const serviceCode = rawData.service_code

    if (serviceCode === '1') {
      return parseDCSCTables(rawData)
    } else if (serviceCode === '2') {
      return parseGMRTables(rawData)
    }
    return rawData
  }

  const parseDCSCTables = (rawData) => {
    const allSections = []
    
    rawData.tables.forEach((table) => {
      const rows = table.rows
      let currentSection = null
      let currentHeaders = []
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        
        // Section title (single cell with "DETAILS")
        if (row.length === 1 && row[0].includes('DETAILS')) {
          if (currentSection && currentSection.data.length > 0) {
            allSections.push(currentSection)
          }
          currentSection = {
            section_title: row[0].trim(),
            table_id: row[0].toLowerCase().replace(/\s+/g, '_'),
            data: []
          }
          currentHeaders = []
          continue
        }
        
        if (!currentSection || row.length === 0) continue
        
        // Detect header row
        const looksLikeHeader = row.length > 1 && 
          row.length < 20 &&
          row.every(cell => cell.length > 0 && cell.length < 50) &&
          !row.some(cell => /^\d{2}-\w{3}-\d{2}/.test(cell))
        
        if (looksLikeHeader && currentHeaders.length === 0) {
          currentHeaders = row.map(h => h.trim().replace(/\s+/g, ' '))
        } else if (currentHeaders.length > 0 && row.length === currentHeaders.length) {
          const obj = {}
          currentHeaders.forEach((header, j) => {
            obj[header || `Column ${j + 1}`] = row[j] || ''
          })
          currentSection.data.push(obj)
        }
      }
      
      if (currentSection && currentSection.data.length > 0) {
        allSections.push(currentSection)
      }
    })
    
    return {
      ...rawData,
      total_tables: allSections.length,
      tables: allSections.map((section, idx) => ({
        table_id: section.table_id,
        table_number: idx + 1,
        section_title: section.section_title,
        data: section.data,
        total_rows: section.data.length
      }))
    }
  }

  const parseGMRTables = (rawData) => {
    return {
      ...rawData,
      tables: rawData.tables.map((table) => {
        const rows = table.rows
        
        // Find header row
        let headerRowIndex = 0
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].length > 1 && rows[i].every(cell => cell.length < 100)) {
            headerRowIndex = i
            break
          }
        }
        
        const headers = rows[headerRowIndex].map(h => h.trim().replace(/\s+/g, ' '))
        const dataRows = rows.slice(headerRowIndex + 1)
        
        const cleanData = dataRows.map(row => {
          const obj = {}
          headers.forEach((header, i) => {
            if (header && row[i] !== undefined) {
              obj[header || `Column ${i + 1}`] = row[i] || ''
            }
          })
          return obj
        })
        
        return {
          table_id: table.table_id,
          table_number: table.table_number,
          data: cleanData,
          total_rows: cleanData.length
        }
      })
    }
  }

  const handleScrape = async () => {
    if (!awbNumber.trim()) {
      setError('Please enter AWB number')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const response = await fetch('http://localhost:3001/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          service: service,
          awbNumber: awbNumber
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        // UI ka kaam: Parse raw table data
        const parsedData = parseTableData(result.data)
        setData(parsedData)
        console.log('✅ Data scraped successfully!')
        console.log('URL:', result.url)
      } else {
        throw new Error(result.error || 'Failed to scrape data')
      }

    } catch (err) {
      setError(`Error: ${err.message}. Make sure backend server is running on port 3001.`)
      console.error('Scraping error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <div className="container">
        <h1>AWB Data Scraper</h1>
        
        <div className="form-section">
          <div className="form-group">
            <label>Select Service:</label>
            <select 
              value={service} 
              onChange={(e) => setService(e.target.value)}
              className="select-box"
            >
              <option value="gmr">GMR ARGO - Cargo Tracking</option>
              <option value="dcsc">DCSC - Delhi Cargo Service Centre</option>
            </select>
          </div>

          <div className="form-group">
            <label>AWB Number:</label>
            <input
              type="text"
              value={awbNumber}
              onChange={(e) => setAwbNumber(e.target.value)}
              placeholder="Enter AWB Number (e.g., 05700359741)"
              className="input-field"
            />
          </div>

          <button 
            onClick={handleScrape} 
            disabled={loading}
            className="scrape-button"
          >
            {loading ? 'Scraping...' : 'Scrape Data'}
          </button>
        </div>

        {error && (
          <div className="error-box">
            <h3>Error:</h3>
            <p>{error}</p>
          </div>
        )}

        {data && (
          <div className="results-section">
            <div className="info-box">
              <h3>📦 Scraping Information</h3>
              <p><strong>AWB Number:</strong> {data.awb_number}</p>
              <p><strong>Service:</strong> {data.service_name}</p>
              <p><strong>Extraction Time:</strong> {data.extraction_time}</p>
              <p><strong>Total Tables:</strong> {data.total_tables}</p>
            </div>

            <div className="tables-section">
              <h3>📊 Extracted Tables ({data.total_tables})</h3>
              {data.tables.map((table, idx) => {
                // Get headers from first data object keys
                const headers = table.data && table.data.length > 0 
                  ? Object.keys(table.data[0]) 
                  : [];
                
                return (
                  <div key={idx} className="table-container">
                    <h4>
                      {table.section_title ? (
                        <>📋 {table.section_title.trim()} ({table.total_rows} rows)</>
                      ) : (
                        <>Table {table.table_number}: {table.table_id} ({table.total_rows} rows)</>
                      )}
                    </h4>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            {headers.map((header, hIdx) => (
                              <th key={hIdx}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.data && table.data.map((row, rowIdx) => (
                            <tr key={rowIdx}>
                              {headers.map((header, cellIdx) => (
                                <td key={cellIdx}>{row[header] || ''}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="json-section">
              <h3>📄 JSON Data</h3>
              <button 
                onClick={() => {
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `awb_${data.awb_number}_${Date.now()}.json`
                  a.click()
                }}
                className="download-button"
              >
                📥 Download JSON
              </button>
              <pre className="json-display">{JSON.stringify(data, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
