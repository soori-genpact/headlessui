import React, { useEffect, useMemo, useState } from 'react'
import apiService, { Field } from '../services/apiService'
import authService from '../services/authService'
import { useToast } from '../context/ToastContext'
import { PDFSourceOverlay, PDFViewer } from '../components/PDFViewer'
import '../styles/auditV2.css'

interface AuditPageV2Props {
  onLogout: () => void
  submissionSysId: string
  versionId?: string
}

type VersionItem = {
  sys_id: string
  version_display_value?: string
  label?: string
  active?: boolean
}

type FieldState = 'review' | 'conflict' | 'missing' | 'validated'
type FilterTab = 'review' | 'conflicts' | 'missing' | 'validated' | 'all'
type SectionFilter = 'all'
type MappingSort = 'confidence' | 'field'

type Coordinate = {
  page: number
}

function parseConfidence(value?: string): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) return null
  return parsed > 1 ? parsed / 100 : parsed
}

function normalizeValue(value?: string): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function getResolvedValue(field: Field): string {
  return field.qa_override_value?.trim()
    || field.data_verification?.trim()
    || field.field_value?.trim()
    || ''
}

function parseCoordinateString(source: string): Coordinate | null {
  const match = source.match(/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/)
  if (!match) return null

  return {
    page: Number.parseInt(match[1], 10)
  }
}

function parseSourceCoordinates(source?: string): Coordinate[] {
  if (!source || typeof source !== 'string') return []
  return source
    .split(';')
    .map((item) => parseCoordinateString(item.trim()))
    .filter((item): item is Coordinate => Boolean(item))
}

function getFieldMarkingsCount(field: Field): number {
  return parseSourceCoordinates(field.source).length
}

function getPrimaryPage(field: Field): number | null {
  const coordinates = parseSourceCoordinates(field.source)
  return coordinates[0]?.page || null
}

function deriveFieldState(field: Field): FieldState {
  const aiValue = field.field_value?.trim() || ''
  const verifiedValue = field.data_verification?.trim() || ''
  const overrideValue = field.qa_override_value?.trim() || ''
  const notes = `${field.logic_transparency || ''} ${field.commentary || ''}`.toLowerCase()
  const confidence = parseConfidence(field.confidence_indicator)

  if (!aiValue && !verifiedValue && !overrideValue) {
    return 'missing'
  }

  if (
    (overrideValue && aiValue && normalizeValue(overrideValue) !== normalizeValue(aiValue))
    || notes.includes('conflict')
  ) {
    return 'conflict'
  }

  if (verifiedValue || overrideValue || (confidence !== null && confidence >= 0.93)) {
    return 'validated'
  }

  return 'review'
}

function getFieldAccentClass(field: Field): string {
  const state = deriveFieldState(field)
  if (state === 'validated') return 'is-validated'
  if (state === 'conflict') return 'is-conflict'
  if (state === 'missing') return 'is-missing'
  return 'is-review'
}

function getFieldStateLabel(field: Field): string {
  const state = deriveFieldState(field)
  if (state === 'validated') return 'validated'
  if (state === 'conflict') return 'conflict'
  if (state === 'missing') return 'missing'
  return 'review'
}

function getConfidenceTone(value?: string): 'high' | 'medium' | 'low' | 'none' {
  const confidence = parseConfidence(value)
  if (confidence === null) return 'none'
  if (confidence >= 0.9) return 'high'
  if (confidence >= 0.75) return 'medium'
  return 'low'
}

function formatConfidence(value?: string): string {
  const confidence = parseConfidence(value)
  if (confidence === null) return '--'
  return `${Math.round(confidence * 100)}`
}

function getOverlayTone(field: Field): PDFSourceOverlay['tone'] {
  const state = deriveFieldState(field)
  if (state === 'validated') return 'validated'
  if (state === 'conflict') return 'conflict'
  if (state === 'missing') return 'missing'
  return 'review'
}

function findFieldValue(fields: Field[], matchers: string[]): string {
  const loweredMatchers = matchers.map((matcher) => matcher.toLowerCase())
  const match = fields.find((field) => loweredMatchers.some((matcher) => field.field_name?.toLowerCase().includes(matcher)))
  return getResolvedValue(match || {} as Field)
}

function sortFields(fields: Field[], sortMode: MappingSort): Field[] {
  if (sortMode === 'field') {
    return [...fields].sort((left, right) => (left.field_name || '').localeCompare(right.field_name || ''))
  }

  return [...fields].sort((left, right) => {
    const leftConfidence = parseConfidence(left.confidence_indicator) ?? -1
    const rightConfidence = parseConfidence(right.confidence_indicator) ?? -1
    return leftConfidence - rightConfidence
  })
}

function prioritizeSelectedField(fields: Field[], selectedFieldId: string): Field[] {
  if (!selectedFieldId) return fields

  const selectedIndex = fields.findIndex((field) => field.sys_id === selectedFieldId)
  if (selectedIndex <= 0) return fields

  const nextFields = [...fields]
  const [selectedField] = nextFields.splice(selectedIndex, 1)
  nextFields.unshift(selectedField)
  return nextFields
}

function getFirstActionField(fields: Field[]): Field | null {
  return fields.find((field) => deriveFieldState(field) !== 'validated') || fields[0] || null
}

export const AuditPageV2: React.FC<AuditPageV2Props> = ({
  onLogout,
  submissionSysId,
  versionId
}) => {
  void onLogout

  const [fields, setFields] = useState<Field[]>([])
  const [submissionNumber, setSubmissionNumber] = useState('')
  const [submissionStatus, setSubmissionStatus] = useState('')
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [selectedVersionSysId, setSelectedVersionSysId] = useState('')
  const [isReadOnlyVersion, setIsReadOnlyVersion] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState('')
  const [selectedAttachmentId, setSelectedAttachmentId] = useState('')
  const [selectedFieldId, setSelectedFieldId] = useState('')
  const [navigateSource, setNavigateSource] = useState('')
  const [navigateSeq, setNavigateSeq] = useState(0)
  const [activeTab, setActiveTab] = useState<FilterTab>('review')
  const [sortMode, setSortMode] = useState<MappingSort>('confidence')
  const [mappingSearch, setMappingSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter | string>('all')
  const [markedOnly, setMarkedOnly] = useState(false)
  const [overrideOnly, setOverrideOnly] = useState(false)
  const [showAiSummary, setShowAiSummary] = useState(true)
  const { showToast } = useToast()

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        if (!submissionSysId) {
          showToast('No submission SysID provided. Use /audit/v2/{submissionSysId}.', 'error', 8000)
          return
        }

        const [, mappingResponse] = await Promise.all([
          apiService.getConfig(),
          apiService.fetchMapping(submissionSysId)
        ])

        const nextFields = mappingResponse.fields || []
        setFields(nextFields)

        const apiResponse = mappingResponse.result
        if (apiResponse?.submissionNumber) {
          setSubmissionNumber(apiResponse.submissionNumber)
        }
        if (apiResponse?.submissionStatusChoice) {
          setSubmissionStatus(apiResponse.submissionStatusChoice)
        }
        if (apiResponse?.versions && Array.isArray(apiResponse.versions)) {
          setVersions(apiResponse.versions)
          const fromUrl = versionId
            ? apiResponse.versions.find((version) => version.sys_id === versionId)
            : null
          const selectedVersion = fromUrl || apiResponse.versions.find((version) => version.active) || apiResponse.versions[0]
          if (selectedVersion) {
            setSelectedVersionSysId(selectedVersion.sys_id)
            setIsReadOnlyVersion(!selectedVersion.active)
          }
        }

        const documentNames = Array.from(
          new Set(nextFields.map((field) => field.attachmentData?.file_name).filter(Boolean))
        ) as string[]

        if (documentNames.length > 0) {
          const firstDocument = documentNames[0]
          setSelectedDocument(firstDocument)
          const firstDocumentField = nextFields.find((field) => field.attachmentData?.file_name === firstDocument)
          if (firstDocumentField?.attachmentData?.sys_id) {
            setSelectedAttachmentId(firstDocumentField.attachmentData.sys_id)
          }
        }

        const firstActionField = getFirstActionField(nextFields)
        if (firstActionField) {
          setSelectedFieldId(firstActionField.sys_id)
        }

        showToast(`Loaded ${nextFields.length} extracted mappings`, 'success', 2500)
      } catch (error) {
        showToast(
          `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
          8000
        )
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [submissionSysId, versionId, showToast])

  const documents = useMemo(() => {
    const documentMap = new Map<string, { name: string; attachmentId: string; fields: Field[] }>()

    fields.forEach((field) => {
      const name = field.attachmentData?.file_name
      if (!name) return

      if (!documentMap.has(name)) {
        documentMap.set(name, {
          name,
          attachmentId: field.attachmentData?.sys_id || '',
          fields: []
        })
      }

      documentMap.get(name)?.fields.push(field)
    })

    return Array.from(documentMap.values()).map((document) => {
      const confidenceValues = document.fields
        .map((field) => parseConfidence(field.confidence_indicator))
        .filter((value): value is number => value !== null)
      const averageConfidence = confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
        : null

      return {
        ...document,
        totalMarkings: document.fields.reduce((sum, field) => sum + getFieldMarkingsCount(field), 0),
        reviewCount: document.fields.filter((field) => deriveFieldState(field) === 'review').length,
        conflictCount: document.fields.filter((field) => deriveFieldState(field) === 'conflict').length,
        missingCount: document.fields.filter((field) => deriveFieldState(field) === 'missing').length,
        validatedCount: document.fields.filter((field) => deriveFieldState(field) === 'validated').length,
        averageConfidence
      }
    })
  }, [fields])

  const selectedDocumentSummary = useMemo(
    () => documents.find((document) => document.name === selectedDocument) || null,
    [documents, selectedDocument]
  )

  const selectedDocumentFields = useMemo(
    () => fields.filter((field) => field.attachmentData?.file_name === selectedDocument),
    [fields, selectedDocument]
  )

  const selectedField = useMemo(
    () => fields.find((field) => field.sys_id === selectedFieldId) || null,
    [fields, selectedFieldId]
  )

  const summary = useMemo(() => {
    const companyName = findFieldValue(fields, ['named insured', 'insured name', 'applicant'])
      || submissionNumber
      || 'Audit workspace'
    const broker = findFieldValue(fields, ['producer', 'broker', 'agency'])
    const subBroker = findFieldValue(fields, ['sub-producer', 'sub producer'])
    const effectiveDate = findFieldValue(fields, ['effective date', 'eff. date'])
    const address = findFieldValue(fields, ['mailing address', 'address'])
    const revenue = findFieldValue(fields, ['annual revenue', 'revenue'])

    return {
      companyName,
      broker,
      subBroker,
      effectiveDate,
      address,
      revenue
    }
  }, [fields, submissionNumber])

  const documentCounts = useMemo(() => {
    const nextCounts = {
      all: selectedDocumentFields.length,
      review: 0,
      conflicts: 0,
      missing: 0,
      validated: 0
    }

    selectedDocumentFields.forEach((field) => {
      const state = deriveFieldState(field)
      if (state === 'review') nextCounts.review += 1
      if (state === 'conflict') nextCounts.conflicts += 1
      if (state === 'missing') nextCounts.missing += 1
      if (state === 'validated') nextCounts.validated += 1
    })

    return nextCounts
  }, [selectedDocumentFields])

  const sectionOptions = useMemo(
    () => Array.from(new Set(selectedDocumentFields.map((field) => (field.section_name || 'Additional fields').trim() || 'Additional fields'))),
    [selectedDocumentFields]
  )

  const filteredFields = useMemo(() => {
    const query = mappingSearch.trim().toLowerCase()

    const nextFields = selectedDocumentFields.filter((field) => {
      const state = deriveFieldState(field)
      const hasMarking = Boolean(field.source && getFieldMarkingsCount(field) > 0)
      const hasOverride = Boolean(field.qa_override_value?.trim())
      const sectionName = (field.section_name || 'Additional fields').trim() || 'Additional fields'

      if (activeTab === 'review' && !(state === 'review' || state === 'conflict' || state === 'missing')) return false
      if (activeTab === 'conflicts' && state !== 'conflict') return false
      if (activeTab === 'missing' && state !== 'missing') return false
      if (activeTab === 'validated' && state !== 'validated') return false
      if (markedOnly && !hasMarking) return false
      if (overrideOnly && !hasOverride) return false
      if (sectionFilter !== 'all' && sectionName !== sectionFilter) return false

      if (!query) return true

      return [
        field.field_name,
        field.field_value,
        field.data_verification,
        field.qa_override_value,
        field.logic_transparency,
        field.commentary
      ].some((value) => value?.toLowerCase().includes(query))
    })

    return prioritizeSelectedField(sortFields(nextFields, sortMode), selectedFieldId)
  }, [activeTab, markedOnly, mappingSearch, overrideOnly, sectionFilter, selectedDocumentFields, selectedFieldId, sortMode])

  const groupedFields = useMemo(() => {
    const groups = new Map<string, Field[]>()

    filteredFields.forEach((field) => {
      const title = (field.section_name || 'Additional fields').trim() || 'Additional fields'
      if (!groups.has(title)) {
        groups.set(title, [])
      }
      groups.get(title)?.push(field)
    })

    return Array.from(groups.entries()).map(([title, items]) => ({ title, items }))
  }, [filteredFields])

  const overlayFields = useMemo(
    () => selectedDocumentFields.filter((field) => Boolean(field.source && getFieldMarkingsCount(field) > 0)),
    [selectedDocumentFields]
  )

  const sourceOverlays = useMemo<PDFSourceOverlay[]>(
    () => overlayFields.map((field) => ({
      id: field.sys_id,
      source: field.source || '',
      label: field.field_name || 'Field',
      tone: getOverlayTone(field),
      isFocused: field.sys_id === selectedFieldId
    })),
    [overlayFields, selectedFieldId]
  )

  const aiSummary = useMemo(() => {
    const openIssues = selectedDocumentFields
      .filter((field) => deriveFieldState(field) !== 'validated')
      .slice(0, 4)
      .map((field) => field.field_name || 'Unnamed field')

    return {
      issueCount: documentCounts.review + documentCounts.conflicts + documentCounts.missing,
      detail: openIssues.length ? openIssues.join(', ') : 'No open issues on this document.',
      markings: overlayFields.length
    }
  }, [documentCounts.conflicts, documentCounts.missing, documentCounts.review, overlayFields.length, selectedDocumentFields])

  useEffect(() => {
    if (!selectedDocument) return

    const currentDocumentField = fields.find((field) => field.sys_id === selectedFieldId && field.attachmentData?.file_name === selectedDocument)
    if (currentDocumentField) return

    const nextField = getFirstActionField(selectedDocumentFields)
    if (nextField) {
      setSelectedFieldId(nextField.sys_id)
    }
  }, [fields, selectedDocument, selectedDocumentFields, selectedFieldId])

  useEffect(() => {
    if (!selectedFieldId) return
    const node = document.querySelector<HTMLElement>(`[data-field-card-id="${selectedFieldId}"]`)
    node?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [selectedFieldId, groupedFields.length])

  useEffect(() => {
    setShowAiSummary(true)
  }, [selectedDocument])

  const handleFieldChange = (fieldId: string, updates: Partial<Field>) => {
    setFields((previousFields) =>
      previousFields.map((field) => (
        field.sys_id === fieldId ? { ...field, ...updates } : field
      ))
    )
    setHasChanges(true)
  }

  const handleOverrideChange = (field: Field, value: string) => {
    handleFieldChange(field.sys_id, {
      qa_override_value: value,
      data_verification: value.trim() ? field.data_verification || field.field_value : field.data_verification
    })
  }

  const handleSelectDocument = (documentName: string) => {
    setSelectedDocument(documentName)
    setSectionFilter('all')
    setMappingSearch('')
    setMarkedOnly(false)
    setOverrideOnly(false)

    const targetField = fields.find((field) => field.attachmentData?.file_name === documentName)
    if (targetField?.attachmentData?.sys_id) {
      setSelectedAttachmentId(targetField.attachmentData.sys_id)
    }

    const nextDocumentFields = fields.filter((field) => field.attachmentData?.file_name === documentName)
    const firstActionField = getFirstActionField(nextDocumentFields)
    if (firstActionField) {
      setSelectedFieldId(firstActionField.sys_id)
      if (firstActionField.source) {
        setNavigateSource(firstActionField.source)
        setNavigateSeq((previousValue) => previousValue + 1)
      }
    }
  }

  const handleVersionChange = (newVersionSysId: string) => {
    setSelectedVersionSysId(newVersionSysId)
    const selectedVersion = versions.find((version) => version.sys_id === newVersionSysId)
    setIsReadOnlyVersion(selectedVersion ? !selectedVersion.active : false)
    showToast(`Switched to version: ${selectedVersion?.version_display_value || 'Unknown'}`, 'info', 3000)
  }

  const handleNavigateToField = (field: Field) => {
    setSelectedFieldId(field.sys_id)

    if (field.attachmentData?.file_name && field.attachmentData.file_name !== selectedDocument) {
      setSelectedDocument(field.attachmentData.file_name)
    }

    if (field.attachmentData?.sys_id && field.attachmentData.sys_id !== selectedAttachmentId) {
      setSelectedAttachmentId(field.attachmentData.sys_id)
    }

    if (!field.source) return

    setNavigateSource(field.source)
    setNavigateSeq((previousValue) => previousValue + 1)
  }

  const handleOverlaySelect = (overlayId: string) => {
    const field = fields.find((item) => item.sys_id === overlayId)
    if (!field) return

    setActiveTab('all')
    setMarkedOnly(false)
    setOverrideOnly(false)
    handleNavigateToField(field)
  }

  const buildSavePayload = () => ({
    submissionNumber,
    dataExtractSysId: submissionSysId,
    updates: fields.map((field) => ({
      sys_id: field.sys_id,
      qa_override_value: field.qa_override_value,
      data_verification: field.data_verification,
      commentary: field.commentary
    }))
  })

  const handleSave = async () => {
    if (!submissionNumber) {
      showToast('Submission number not available', 'error', 5000)
      return
    }

    try {
      setSaving(true)
      await apiService.saveMapping(buildSavePayload())
      setHasChanges(false)
      showToast('Changes saved', 'success', 3000)
    } catch (error) {
      showToast(
        `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        8000
      )
    } finally {
      setSaving(false)
    }
  }

  const handleAcceptField = (field: Field) => {
    const acceptedValue = field.field_value?.trim() || getResolvedValue(field)
    if (!acceptedValue) {
      showToast(`No extracted value available for ${field.field_name}`, 'warning', 4000)
      return
    }

    handleFieldChange(field.sys_id, {
      data_verification: acceptedValue,
      qa_override_value: ''
    })
  }

  const handleAcceptAllHighConfidence = () => {
    let acceptedCount = 0

    setFields((previousFields) => previousFields.map((field) => {
      const belongsToSelectedDocument = field.attachmentData?.file_name === selectedDocument
      const confidence = parseConfidence(field.confidence_indicator)
      const state = deriveFieldState(field)

      if (
        belongsToSelectedDocument
        && confidence !== null
        && confidence >= 0.9
        && state === 'review'
        && field.field_value?.trim()
      ) {
        acceptedCount += 1
        return {
          ...field,
          data_verification: field.field_value,
          qa_override_value: ''
        }
      }

      return field
    }))

    if (acceptedCount > 0) {
      setHasChanges(true)
      showToast(`Accepted ${acceptedCount} high-confidence mappings on this document`, 'success', 3000)
    } else {
      showToast('No high-confidence review mappings on this document', 'info', 2500)
    }
  }

  const handleComplete = async () => {
    if (!submissionNumber) {
      showToast('Submission number not available', 'error', 5000)
      return
    }

    try {
      setCompleting(true)

      if (hasChanges) {
        await apiService.saveMapping(buildSavePayload())
        setHasChanges(false)
      }

      await apiService.markComplete(submissionNumber, submissionSysId)
      setIsComplete(true)
      showToast('Submission completed successfully', 'success', 5000)
    } catch (error) {
      showToast(
        `Completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        8000
      )
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="audit-v2-page">
        <div className="loading-overlay">
          <div className="loader-container">
            <div className="spinner" />
            <p className="loading-text">Loading audit v2 workspace...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="audit-v2-page">
      <header className="audit-v2-topbar">
        <div className="audit-v2-breadcrumbs">
          <span>Cases</span>
          <i className="fas fa-chevron-right" />
          <span>{submissionNumber || submissionSysId}</span>
          <i className="fas fa-chevron-right" />
          <strong>Validate · {selectedDocument || 'Audit V2'}</strong>
        </div>

        <div className="audit-v2-topbar-actions">
          <button type="button" className="audit-v2-ghost-button">
            <i className="fas fa-history" />
            Activity
          </button>
          <button type="button" className="audit-v2-ghost-button">
            <i className="far fa-comment" />
            Comments
          </button>
          <button
            type="button"
            className="audit-v2-outline-button"
            onClick={() => showToast('Re-extract is not wired in this headless variant yet.', 'info', 3500)}
          >
            <i className="fas fa-rotate-right" />
            Re-extract
          </button>
          <button
            type="button"
            className="audit-v2-primary-button"
            onClick={handleComplete}
            disabled={completing || isComplete}
          >
            {isComplete ? 'Submitted' : completing ? 'Submitting...' : 'Submit to UW'}
            <i className="fas fa-chevron-right" />
          </button>
        </div>
      </header>

      <section className="audit-v2-case-strip">
        <div className="audit-v2-case-icon">
          <i className="far fa-building" />
        </div>

        <div className="audit-v2-case-meta">
          <div className="audit-v2-case-title-row">
            <h1>{summary.companyName}</h1>
            <span className="audit-v2-mono">{submissionNumber || submissionSysId}</span>
            <span className="audit-v2-pill audit-v2-pill-indigo">{submissionStatus || 'In UW'}</span>
            {isReadOnlyVersion && <span className="audit-v2-pill audit-v2-pill-zinc">Read only</span>}
          </div>

          <div className="audit-v2-case-subtitle">
            {summary.broker && <span><i className="fas fa-user-group" /> {summary.broker}</span>}
            {summary.subBroker && <span>{summary.subBroker}</span>}
            {summary.revenue && <span>{summary.revenue} est. revenue</span>}
            {summary.effectiveDate && <span>Eff. {summary.effectiveDate}</span>}
            {summary.address && <span>{summary.address}</span>}
          </div>
        </div>

        {showAiSummary && (
          <div className="audit-v2-case-summary">
            <div className="audit-v2-case-summary-line">
              <span className="audit-v2-label accent">
                <i className="fas fa-wand-magic-sparkles" />
                AI completeness check
              </span>
              <strong>{aiSummary.issueCount} issues</strong>
              <span className="audit-v2-case-summary-text">
                {selectedDocumentSummary?.name || selectedDocument || 'This document'} has {aiSummary.markings} mapped regions. Review: {aiSummary.detail}
              </span>
              <button
                type="button"
                className="audit-v2-text-button audit-v2-case-summary-action"
                onClick={() => showToast('Draft chase flow is not connected in this variant yet.', 'info', 3500)}
              >
                Draft chase to broker
              </button>
              <button
                type="button"
                className="audit-v2-text-button audit-v2-case-summary-action"
                onClick={() => showToast('AI summary is based on open items for the selected document.', 'info', 2500)}
              >
                Why
              </button>
              <button
                type="button"
                className="audit-v2-text-button audit-v2-case-summary-action"
                onClick={() => setShowAiSummary(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="audit-v2-case-badges">
          <span className="audit-v2-pill audit-v2-pill-amber">
            <i className="far fa-clock" />
            38m left
          </span>
          <span className="audit-v2-pill audit-v2-pill-violet">
            <i className="fas fa-sparkles" />
            Doc confidence {selectedDocumentSummary?.averageConfidence ? Math.round(selectedDocumentSummary.averageConfidence * 100) : 0}%
          </span>
          <span className="audit-v2-pill audit-v2-pill-amber-outline">
            {documentCounts.conflicts} conflict · {documentCounts.missing} missing
          </span>
        </div>
      </section>

      <section className="audit-v2-stage-rail">
        {[
          ['Intake', 'complete · 1m', 'done'],
          ['Clearance', 'complete · 14m', 'done'],
          ['Completeness', `${documentCounts.validated}/${Math.max(documentCounts.all, 1)} valid`, 'done'],
          ['Enrichment', `${selectedDocumentSummary?.totalMarkings || 0} live markings`, 'done'],
          ['Underwriting', 'validation in progress', 'active'],
          ['Quote', 'pending', 'pending']
        ].map(([label, detail, state], index) => (
          <div key={label} className={`audit-v2-stage audit-v2-stage-${state}`}>
            <div className="audit-v2-stage-title">
              <span className="audit-v2-stage-index">
                {state === 'done' ? <i className="fas fa-check" /> : index + 1}
              </span>
              <span>{label}</span>
            </div>
            <span className="audit-v2-stage-detail">{detail}</span>
          </div>
        ))}
      </section>

      <section className="audit-v2-workspace">
        <aside className="audit-v2-left-column">
          <div className="audit-v2-panel audit-v2-left-panel">
            <div className="audit-v2-panel-head">
              <div>
                <h2>Documents</h2>
              </div>
              <button type="button" className="audit-v2-text-button">
                + Add
              </button>
            </div>

            <div className="audit-v2-progress-block">
              <div className="audit-v2-progress-track">
                <span style={{ width: `${documentCounts.all ? Math.round((documentCounts.validated / documentCounts.all) * 100) : 0}%` }} />
              </div>
              <div className="audit-v2-progress-meta">
                <span>{documentCounts.review + documentCounts.conflicts + documentCounts.missing} open</span>
                <span>{selectedDocumentSummary?.totalMarkings || 0} markings</span>
                <strong>{documentCounts.validated}/{documentCounts.all || 0}</strong>
              </div>
            </div>

            <div className="audit-v2-doc-list">
              {documents.map((document) => {
                const isActive = document.name === selectedDocument
                const confidence = document.averageConfidence === null ? '--' : `${Math.round(document.averageConfidence * 100)}%`

                return (
                  <button
                    key={document.name}
                    type="button"
                    className={`audit-v2-doc-card ${isActive ? 'is-active' : ''}`}
                    onClick={() => handleSelectDocument(document.name)}
                  >
                    <div className="audit-v2-doc-card-head">
                      <span className="audit-v2-doc-icon">
                        <i className="far fa-file-lines" />
                      </span>
                      <div className="audit-v2-doc-title">
                        <strong>{document.name.replace(/\.[^.]+$/, '')}</strong>
                        <span>
                          {document.fields.length} extracted mapping{document.fields.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <div className="audit-v2-doc-card-foot">
                      <span className="audit-v2-pill audit-v2-pill-green">ready</span>
                      <span className="audit-v2-doc-confidence">{confidence}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="audit-v2-side-links">
              <button type="button" className="audit-v2-link-row">
                <i className="fas fa-layer-group" />
                Merged risk profile
              </button>
              <button type="button" className="audit-v2-link-row">
                <i className="fas fa-code-compare" />
                Compare doc versions
              </button>
            </div>
          </div>
        </aside>

        <main className="audit-v2-center-column">
          <div className="audit-v2-panel audit-v2-viewer-panel">
            <PDFViewer
              attachmentId={selectedAttachmentId}
              documentName={selectedDocument || 'No document selected'}
              baseUrl={authService.getConfig()?.baseUrl}
              token={authService.getToken()?.access_token}
              navigateSource={navigateSource}
              navigateKey={navigateSeq}
              sourceOverlays={sourceOverlays}
              onOverlaySelect={handleOverlaySelect}
            />
          </div>
        </main>

        <aside className="audit-v2-right-column">
          <div className="audit-v2-panel audit-v2-right-panel">
            <div className="audit-v2-tabs">
              {[
                ['review', 'Needs review', documentCounts.review + documentCounts.conflicts + documentCounts.missing],
                ['conflicts', 'Conflicts', documentCounts.conflicts],
                ['missing', 'Missing', documentCounts.missing],
                ['validated', 'Validated', documentCounts.validated],
                ['all', 'All', documentCounts.all]
              ].map(([tabId, label, count]) => (
                <button
                  key={tabId}
                  type="button"
                  className={`audit-v2-tab ${activeTab === tabId ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tabId as FilterTab)}
                >
                  <span>{label}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>

            <div className="audit-v2-mapping-toolbar">
              <div className="audit-v2-mapping-toolbar-row">
                <label className="audit-v2-search">
                  <i className="fas fa-search" />
                  <input
                    type="text"
                    value={mappingSearch}
                    onChange={(event) => setMappingSearch(event.target.value)}
                    placeholder="Filter mappings on this document"
                  />
                </label>
                <select
                  className="audit-v2-select"
                  value={sectionFilter}
                  onChange={(event) => setSectionFilter(event.target.value)}
                >
                  <option value="all">All sections</option>
                  {sectionOptions.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </div>

              <div className="audit-v2-mapping-toolbar-row">
                <button type="button" className="audit-v2-outline-button small" onClick={handleAcceptAllHighConfidence}>
                  <i className="fas fa-check" />
                  Accept high-conf
                </button>
                <button
                  type="button"
                  className={`audit-v2-outline-button small ${sortMode === 'confidence' ? 'is-active' : ''}`}
                  onClick={() => setSortMode(sortMode === 'confidence' ? 'field' : 'confidence')}
                >
                  <i className="fas fa-filter" />
                  {sortMode === 'confidence' ? 'Sort: low conf first' : 'Sort: field name'}
                </button>
                <button
                  type="button"
                  className={`audit-v2-outline-button small ${markedOnly ? 'is-active' : ''}`}
                  onClick={() => setMarkedOnly((currentValue) => !currentValue)}
                >
                  <i className="fas fa-crosshairs" />
                  Marked only
                </button>
                <button
                  type="button"
                  className={`audit-v2-outline-button small ${overrideOnly ? 'is-active' : ''}`}
                  onClick={() => setOverrideOnly((currentValue) => !currentValue)}
                >
                  <i className="fas fa-pen" />
                  Overrides
                </button>
              </div>

              <div className="audit-v2-toolbar-summary">
                <span>{selectedDocumentFields.length} extracted mappings</span>
                <span>{overlayFields.length} linked to the document</span>
                <span>{filteredFields.length} shown after filters</span>
              </div>
            </div>

            <div className="audit-v2-field-groups">
              {groupedFields.map((group) => (
                <section key={group.title} className="audit-v2-field-group">
                  <div className="audit-v2-group-head">
                    <span className="audit-v2-label">{group.title}</span>
                    <strong>{group.items.length}</strong>
                  </div>

                  <div className="audit-v2-field-list">
                    {group.items.map((field) => {
                      const resolvedValue = getResolvedValue(field)
                      const extractedValue = field.field_value?.trim() || ''
                      const isSelected = selectedField?.sys_id === field.sys_id
                      const confidenceTone = getConfidenceTone(field.confidence_indicator)
                      const confidenceClass = confidenceTone === 'high'
                        ? 'is-high'
                        : confidenceTone === 'medium'
                          ? 'is-medium'
                          : confidenceTone === 'low'
                            ? 'is-low'
                            : ''
                      const markingCount = getFieldMarkingsCount(field)
                      const pageNumber = getPrimaryPage(field)

                      return (
                        <article
                          key={field.sys_id}
                          className={`audit-v2-field-card ${getFieldAccentClass(field)} ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => handleNavigateToField(field)}
                        >
                          <div className="audit-v2-field-card-head">
                            <div>
                              <span className="audit-v2-label">{field.field_name || 'Unnamed field'}</span>
                              <div className="audit-v2-field-meta">
                                <span className={`audit-v2-confidence ${confidenceClass}`}>
                                  <span className="audit-v2-confidence-bar"><i style={{ width: `${formatConfidence(field.confidence_indicator)}%` }} /></span>
                                  {formatConfidence(field.confidence_indicator)}
                                </span>
                                <span className={`audit-v2-status-tag ${getFieldAccentClass(field)}`}>
                                  {getFieldStateLabel(field)}
                                </span>
                                {pageNumber && (
                                  <span className="audit-v2-mini-tag">
                                    page {pageNumber}
                                  </span>
                                )}
                                {!!markingCount && (
                                  <span className="audit-v2-mini-tag">
                                    {markingCount} mark{markingCount > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>

                            {field.source && (
                              <button
                                type="button"
                                className="audit-v2-icon-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleNavigateToField(field)
                                }}
                                title="Go to source"
                              >
                                <i className="fas fa-crosshairs" />
                              </button>
                            )}
                          </div>

                          <div className="audit-v2-value-block">
                            <span className="audit-v2-label">Extracted value</span>
                            <div className={`audit-v2-extracted-value ${extractedValue ? '' : 'is-empty'}`}>
                              {extractedValue || 'No extracted value'}
                            </div>
                          </div>

                          <div className="audit-v2-value-block">
                            <span className="audit-v2-label">Override value</span>
                            <input
                              value={field.qa_override_value || ''}
                              onChange={(event) => handleOverrideChange(field, event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              disabled={saving || completing || isReadOnlyVersion}
                              className="audit-v2-field-input"
                              placeholder={extractedValue || 'Add override'}
                            />
                          </div>

                          <div className="audit-v2-field-source-line">
                            <span>
                              Current decision: {resolvedValue || 'Not reviewed yet'}
                            </span>
                            {field.logic_transparency && (
                              <span className="audit-v2-field-subline">{field.logic_transparency}</span>
                            )}
                          </div>

                          <div className="audit-v2-field-actions">
                            <button
                              type="button"
                              className="audit-v2-accept-button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleAcceptField(field)
                              }}
                              disabled={saving || completing || isReadOnlyVersion}
                            >
                              <i className="fas fa-check" />
                              Accept extracted
                            </button>
                            <button
                              type="button"
                              className="audit-v2-text-button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleNavigateToField(field)
                              }}
                            >
                              Link to document
                            </button>
                            {!!field.qa_override_value && (
                              <button
                                type="button"
                                className="audit-v2-text-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleOverrideChange(field, '')
                                }}
                              >
                                Clear override
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}

              {!groupedFields.length && (
                <div className="audit-v2-empty-state">
                  <i className="fas fa-circle-check" />
                  <p>No mappings match the current document filters.</p>
                </div>
              )}
            </div>

            <div className="audit-v2-footer-bar">
              <div className="audit-v2-footer-meta">
                <i className="far fa-clock" />
                <span>Validated in <strong>1m 14s</strong></span>
                {!!versions.length && (
                  <select
                    className="audit-v2-version-select"
                    value={selectedVersionSysId}
                    onChange={(event) => handleVersionChange(event.target.value)}
                  >
                    {versions.map((version) => (
                      <option key={version.sys_id} value={version.sys_id}>
                        {version.label || version.version_display_value || version.sys_id}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="audit-v2-footer-actions">
                <button
                  type="button"
                  className="audit-v2-ghost-button"
                  onClick={handleSave}
                  disabled={!hasChanges || saving || completing}
                >
                  {saving ? 'Saving...' : 'Save & exit'}
                </button>
                <button
                  type="button"
                  className="audit-v2-primary-button"
                  onClick={handleComplete}
                  disabled={completing || isComplete}
                >
                  {isComplete ? 'Submitted' : completing ? 'Submitting...' : 'Submit to UW'}
                  <i className="fas fa-chevron-right" />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
