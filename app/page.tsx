'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import { copyToClipboard } from '@/lib/clipboard'
import { useLyzrAgentEvents } from '@/lib/lyzrAgentEvents'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FiHash, FiFileText, FiClipboard, FiCopy, FiDownload, FiAlertTriangle, FiChevronDown, FiChevronRight, FiCheckCircle, FiLoader, FiSearch, FiEdit3, FiTarget, FiUsers, FiLayers, FiCpu, FiClock, FiBriefcase, FiZap, FiBookOpen, FiUploadCloud, FiX, FiPaperclip } from 'react-icons/fi'

// --- Constants ---
const MANAGER_AGENT_ID = '6996271fb3106c6867a6c6ac'

const AGENTS = [
  { id: '6996271fb3106c6867a6c6ac', name: 'Intake Coordinator', role: 'Manager - orchestrates sub-agents', active: false },
  { id: '699626ef4a9c68de2584b947', name: 'Slack Harvester', role: 'Extracts Slack conversations', active: false },
  { id: '6996270724c85f9f3404709a', name: 'Insight Extractor', role: 'Analyzes and extracts insights', active: false },
  { id: '699626cbf17ccc575ee48c57', name: 'Document Composer', role: 'Composes final document', active: false },
]

// --- Theme ---
const THEME_VARS: React.CSSProperties = {
  '--background': '0 0% 100%',
  '--foreground': '222 47% 11%',
  '--card': '0 0% 98%',
  '--card-foreground': '222 47% 11%',
  '--primary': '222 47% 11%',
  '--primary-foreground': '210 40% 98%',
  '--secondary': '210 40% 96%',
  '--secondary-foreground': '222 47% 11%',
  '--accent': '210 40% 92%',
  '--accent-foreground': '222 47% 11%',
  '--muted': '210 40% 94%',
  '--muted-foreground': '215 16% 47%',
  '--border': '214 32% 91%',
  '--destructive': '0 84% 60%',
  '--destructive-foreground': '210 40% 98%',
  '--radius': '0.875rem',
} as React.CSSProperties

// --- Types ---
interface ClarificationItem {
  priority?: string
  category?: string
  description?: string
}

interface IntakeDocument {
  document_title?: string
  generation_date?: string
  data_sources?: string[]
  executive_summary?: string
  problem_statement?: string
  project_goals?: string
  success_criteria?: string
  stakeholder_map?: string
  project_scope?: string
  technical_requirements?: string
  timeline_milestones?: string
  resource_needs?: string
  needs_clarification?: ClarificationItem[]
  processing_status?: string
}

// --- Parsing ---
function parseAgentResponse(result: any): IntakeDocument | null {
  try {
    let data = result?.response?.result
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        return null
      }
    }
    if (data?.response && typeof data.response === 'string') {
      try {
        data = JSON.parse(data.response)
      } catch { /* keep original */ }
    }
    if (data?.response && typeof data.response === 'object') {
      data = data.response
    }
    return data as IntakeDocument
  } catch {
    if (result?.raw_response) {
      try {
        return JSON.parse(result.raw_response) as IntakeDocument
      } catch { /* ignore */ }
    }
    return null
  }
}

// --- Markdown renderer ---
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1 text-foreground">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1 text-foreground">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2 text-foreground">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm text-foreground/85 leading-relaxed">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm text-foreground/85 leading-relaxed">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm text-foreground/85 leading-relaxed">{formatInline(line)}</p>
      })}
    </div>
  )
}

// --- Section Config ---
interface SectionConfig {
  key: keyof IntakeDocument
  title: string
  icon: React.ReactNode
}

const DOCUMENT_SECTIONS: SectionConfig[] = [
  { key: 'problem_statement', title: 'Problem Statement', icon: <FiTarget className="h-4 w-4" /> },
  { key: 'project_goals', title: 'Project Goals', icon: <FiZap className="h-4 w-4" /> },
  { key: 'success_criteria', title: 'Success Criteria', icon: <FiCheckCircle className="h-4 w-4" /> },
  { key: 'stakeholder_map', title: 'Stakeholder Map', icon: <FiUsers className="h-4 w-4" /> },
  { key: 'project_scope', title: 'Project Scope', icon: <FiLayers className="h-4 w-4" /> },
  { key: 'technical_requirements', title: 'Technical Requirements', icon: <FiCpu className="h-4 w-4" /> },
  { key: 'timeline_milestones', title: 'Timeline & Milestones', icon: <FiClock className="h-4 w-4" /> },
  { key: 'resource_needs', title: 'Resource Needs', icon: <FiBriefcase className="h-4 w-4" /> },
]

// --- Loading steps ---
const LOADING_STEPS = [
  { label: 'Harvesting Slack conversations...', icon: <FiHash className="h-5 w-5" />, duration: 4000 },
  { label: 'Extracting insights...', icon: <FiSearch className="h-5 w-5" />, duration: 4000 },
  { label: 'Composing document...', icon: <FiEdit3 className="h-5 w-5" />, duration: 4000 },
]

// --- Sample Data ---
const SAMPLE_FORM = {
  channel: '#project-atlas-kickoff',
  transcripts: `Meeting Transcript - Project Atlas Kickoff (Feb 14, 2026)

Attendees: Sarah Chen (PM), Mike Rodriguez (Lead Engineer), Lisa Park (Design Lead), James Wilson (VP Product)

James: "We need to rebuild our customer onboarding flow. Current drop-off rate is 43% at step 3. We're losing an estimated $2.1M ARR from this."

Sarah: "What's the timeline looking like?"

James: "We need this shipped by end of Q2. Board presentation is in July and this is the centerpiece."

Mike: "We'll need to integrate with the new identity service. That's a dependency on Platform team. I'd suggest we use React Server Components for the new flow - it'll cut load times significantly."

Lisa: "I'll need at least 2 weeks for user research before we start designing. We should run usability tests with 8-10 users from different segments."

Sarah: "Budget constraints?"

James: "We have headcount for 2 additional engineers. Total budget approved is $450K including tooling."`,
  notes: `Quick Notes from Atlas Pre-Meeting:
- Current onboarding: 5 steps, avg completion time 12 min
- Competitor benchmark: Acme Corp does it in 3 steps / 4 min
- Key stakeholders: Product (James W), Engineering (Mike R), Design (Lisa P), Customer Success (TBD)
- Risk: Platform team identity service may slip to March
- Success = reduce drop-off to under 20%, completion time under 6 min
- Need mobile-responsive flow (38% of signups are mobile)
- Must maintain SOC2 compliance throughout
- Analytics: need funnel tracking at each step`,
}

const SAMPLE_DOCUMENT: IntakeDocument = {
  document_title: 'Project Atlas - Customer Onboarding Redesign',
  generation_date: '2026-02-18',
  data_sources: ['#project-atlas-kickoff (Slack)', 'Kickoff Meeting Transcript (Feb 14)', 'Pre-Meeting Notes'],
  executive_summary: 'Project Atlas aims to fundamentally redesign the customer onboarding flow to address a critical 43% drop-off rate at step 3, which is costing an estimated $2.1M in annual recurring revenue. The project has executive sponsorship from VP Product James Wilson, with a Q2 2026 delivery target and an approved budget of $450K. The initiative will leverage modern frontend technologies (React Server Components) and require close coordination with the Platform team for identity service integration.',
  problem_statement: '## Current State\nThe existing customer onboarding flow consists of **5 steps** with an average completion time of **12 minutes**. The critical pain point is a **43% drop-off rate at step 3**, resulting in an estimated **$2.1M ARR loss**.\n\n## Competitive Gap\n- **Acme Corp** (primary competitor) completes onboarding in **3 steps / 4 minutes**\n- Current flow is 67% longer in steps and 200% longer in time\n\n## Impact\n- Revenue impact: $2.1M ARR lost annually\n- Customer experience degradation\n- Competitive disadvantage in enterprise market',
  project_goals: '1. **Reduce onboarding drop-off rate** from 43% to under 20%\n2. **Cut completion time** from 12 minutes to under 6 minutes\n3. **Reduce onboarding steps** from 5 to 3 (matching competitor benchmark)\n4. **Improve mobile experience** - 38% of signups originate from mobile devices\n5. **Maintain SOC2 compliance** throughout the redesigned flow\n6. **Implement comprehensive analytics** with funnel tracking at each step',
  success_criteria: '- Drop-off rate at step 3 reduced to **< 20%** (from 43%)\n- Overall completion time **< 6 minutes** (from 12 minutes)\n- Mobile completion rate parity with desktop (within 5%)\n- SOC2 audit passed post-launch\n- Funnel analytics operational with real-time dashboards\n- User satisfaction score (CSAT) **> 4.2/5** in post-onboarding survey',
  stakeholder_map: '### Executive Sponsor\n- **James Wilson** - VP Product (budget owner, board presentation in July)\n\n### Core Team\n- **Sarah Chen** - Project Manager\n- **Mike Rodriguez** - Lead Engineer (technical architecture decisions)\n- **Lisa Park** - Design Lead (user research & UX)\n\n### Dependencies\n- **Platform Team** - Identity service integration (risk: potential March slip)\n- **Customer Success** - TBD representative needed\n\n### Extended Stakeholders\n- Security/Compliance team (SOC2 review)\n- Analytics/Data team (funnel tracking setup)',
  project_scope: '### In Scope\n- Complete redesign of onboarding UI/UX (steps 1-5 consolidated to 3)\n- React Server Components frontend implementation\n- Identity service integration (Platform team dependency)\n- Mobile-responsive design\n- Analytics instrumentation (funnel tracking per step)\n- User research phase (2 weeks, 8-10 participants)\n- Usability testing across user segments\n\n### Out of Scope\n- Backend identity service development (Platform team owns)\n- Changes to billing/payment flow\n- Admin dashboard redesign\n- Legacy onboarding flow maintenance post-migration',
  technical_requirements: '- **Frontend Framework**: React Server Components for improved load times\n- **Identity Integration**: New identity service API (Platform team)\n- **Mobile**: Responsive design supporting 38% mobile user base\n- **Compliance**: SOC2 controls maintained throughout flow\n- **Analytics**: Step-by-step funnel tracking with real-time dashboards\n- **Performance**: Page load time < 2 seconds on 3G connections\n- **Accessibility**: WCAG 2.1 AA compliance\n- **Browser Support**: Last 2 versions of Chrome, Firefox, Safari, Edge',
  timeline_milestones: '### Phase 1: Discovery & Research (Weeks 1-2)\n- User research with 8-10 participants across segments\n- Competitive analysis deep-dive\n- Technical architecture review with Platform team\n\n### Phase 2: Design & Prototyping (Weeks 3-5)\n- UX wireframes and high-fidelity mockups\n- Usability testing (2 rounds)\n- Design system component creation\n\n### Phase 3: Development (Weeks 6-12)\n- Sprint 1-2: Core flow + identity integration\n- Sprint 3-4: Mobile optimization + analytics\n- Sprint 5-6: Polish, edge cases, accessibility\n\n### Phase 4: Testing & Launch (Weeks 13-15)\n- QA testing + SOC2 compliance review\n- Staged rollout (10% -> 50% -> 100%)\n- Post-launch monitoring\n\n**Target Delivery**: End of Q2 2026 (before July board presentation)',
  resource_needs: '### Team\n- 1 Project Manager (Sarah Chen - allocated)\n- 1 Lead Engineer (Mike Rodriguez - allocated)\n- 1 Design Lead (Lisa Park - allocated)\n- **2 Additional Engineers** (approved headcount, need to hire/assign)\n- 1 Customer Success representative (TBD)\n\n### Budget\n- **Total Approved**: $450,000\n- Engineering headcount: ~$300K\n- Tooling & infrastructure: ~$80K\n- User research & testing: ~$40K\n- Contingency: ~$30K\n\n### Dependencies\n- Platform team identity service delivery (critical path)\n- Security team availability for SOC2 review (week 13-14)',
  needs_clarification: [
    { priority: 'High', category: 'Dependency', description: 'Confirm Platform team identity service delivery date - current risk of slip to March could impact project timeline by 2-4 weeks.' },
    { priority: 'High', category: 'Stakeholder', description: 'Customer Success team representative needs to be identified and assigned to provide input on common onboarding friction points.' },
    { priority: 'Medium', category: 'Technical', description: 'Clarify data migration strategy for users currently mid-onboarding when new flow launches. Need rollback plan.' },
    { priority: 'Low', category: 'Analytics', description: 'Confirm which analytics platform will be used for funnel tracking (existing Mixpanel or new tool?).' },
  ],
  processing_status: 'completed',
}

// --- Collapsible Section Component ---
function DocumentSection({ section, content }: { section: SectionConfig; content: string | undefined }) {
  const [isOpen, setIsOpen] = useState(true)

  if (!content) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border rounded-xl overflow-hidden bg-white/60 backdrop-blur-sm">
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full px-5 py-4 hover:bg-accent/50 transition-colors duration-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/5 text-primary">
              {section.icon}
            </div>
            <span className="font-semibold text-sm text-foreground tracking-tight">{section.title}</span>
          </div>
          <div className="text-muted-foreground">
            {isOpen ? <FiChevronDown className="h-4 w-4" /> : <FiChevronRight className="h-4 w-4" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-5 pb-5 pt-0">
          <Separator className="mb-4" />
          {renderMarkdown(content)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// --- Clarification Banner ---
function ClarificationBanner({ items }: { items: ClarificationItem[] }) {
  const [isOpen, setIsOpen] = useState(true)
  const safeItems = Array.isArray(items) ? items : []

  if (safeItems.length === 0) return null

  const priorityColor = (p?: string) => {
    const lower = (p ?? '').toLowerCase()
    if (lower === 'high') return 'bg-red-100 text-red-700 border-red-200'
    if (lower === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-blue-100 text-blue-700 border-blue-200'
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50/80 backdrop-blur-sm overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full px-5 py-4 hover:bg-amber-100/50 transition-colors">
            <div className="flex items-center gap-3">
              <FiAlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="font-semibold text-sm text-amber-900">Needs Clarification</span>
              <Badge variant="outline" className="border-amber-300 text-amber-700 text-xs">{safeItems.length} {safeItems.length === 1 ? 'item' : 'items'}</Badge>
            </div>
            <div className="text-amber-600">
              {isOpen ? <FiChevronDown className="h-4 w-4" /> : <FiChevronRight className="h-4 w-4" />}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-3">
            {safeItems.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-white/70 border border-amber-200">
                <Badge variant="outline" className={`text-xs shrink-0 mt-0.5 ${priorityColor(item?.priority)}`}>
                  {item?.priority ?? 'Unknown'}
                </Badge>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-amber-800 block mb-0.5">{item?.category ?? 'General'}</span>
                  <p className="text-sm text-foreground/80 leading-relaxed">{item?.description ?? ''}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// --- Loading Stepper ---
function LoadingStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
            <FiLoader className="h-7 w-7 text-primary animate-spin" />
          </div>
          <h3 className="font-serif font-semibold text-lg text-foreground tracking-tight">Generating Document</h3>
          <p className="text-sm text-muted-foreground mt-1">This may take a moment...</p>
        </div>

        {LOADING_STEPS.map((step, idx) => {
          const isActive = idx === currentStep
          const isCompleted = idx < currentStep

          return (
            <div key={idx} className="flex items-center gap-4">
              <div className={`flex items-center justify-center h-10 w-10 rounded-xl shrink-0 transition-all duration-500 ${isCompleted ? 'bg-green-100 text-green-600' : isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {isCompleted ? <FiCheckCircle className="h-5 w-5" /> : step.icon}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium transition-colors duration-300 ${isActive ? 'text-foreground' : isCompleted ? 'text-green-700' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                {isActive && (
                  <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: '70%' }} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-10 space-y-3 w-full max-w-md">
        <Skeleton className="h-4 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6 mx-auto" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-4 w-2/3 mx-auto" />
      </div>
    </div>
  )
}

// --- Empty State ---
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-accent/60 mb-6">
        <FiBookOpen className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="font-serif font-semibold text-xl text-foreground tracking-tight mb-2">
        No Document Generated Yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        Enter your Slack channel name, upload or paste meeting transcripts and notes, then hit generate to create a comprehensive project intake document.
      </p>
      <div className="flex items-center gap-6 mt-8 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <FiHash className="h-3.5 w-3.5" />
          <span>Slack data</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FiSearch className="h-3.5 w-3.5" />
          <span>Insights</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FiFileText className="h-3.5 w-3.5" />
          <span>Document</span>
        </div>
      </div>
    </div>
  )
}

// --- Uploaded file type ---
interface UploadedFileInfo {
  file: File
  name: string
  size: string
  textContent: string | null
  assetId: string | null
  uploading: boolean
  error: string | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const ACCEPTED_FILE_TYPES = '.txt,.md,.doc,.docx,.pdf,.rtf,.csv,.json,.log'
const MAX_FILE_SIZE_MB = 10

async function readFileAsText(file: File): Promise<string | null> {
  const textTypes = ['text/', 'application/json', 'application/csv']
  const isTextFile = textTypes.some(t => file.type.startsWith(t)) ||
    /\.(txt|md|csv|json|log|rtf)$/i.test(file.name)

  if (!isTextFile) return null

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve(null)
    reader.readAsText(file)
  })
}

// --- File Upload Zone Component ---
function FileUploadZone({
  label,
  icon,
  files,
  onFilesAdd,
  onFileRemove,
  disabled,
}: {
  label: string
  icon: React.ReactNode
  files: UploadedFileInfo[]
  onFilesAdd: (files: File[]) => void
  onFileRemove: (index: number) => void
  disabled: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled) return
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) onFilesAdd(droppedFiles)
  }, [disabled, onFilesAdd])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? [])
    if (selectedFiles.length > 0) onFilesAdd(selectedFiles)
    if (inputRef.current) inputRef.current.value = ''
  }, [onFilesAdd])

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : disabled
            ? 'border-border/50 bg-muted/30 cursor-not-allowed opacity-60'
            : 'border-border hover:border-primary/50 hover:bg-accent/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
        <div className={`flex items-center justify-center h-10 w-10 rounded-xl transition-colors ${isDragging ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <FiUploadCloud className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isDragging ? 'Drop files here' : 'Drop files or click to upload'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            TXT, MD, PDF, DOC, DOCX, CSV, JSON (max {MAX_FILE_SIZE_MB}MB)
          </p>
        </div>
      </div>

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((fileInfo, idx) => (
            <div
              key={`${fileInfo.name}-${idx}`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/60 border border-border text-sm group"
            >
              <FiPaperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{fileInfo.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {fileInfo.size}
                  {fileInfo.uploading && ' -- Uploading...'}
                  {fileInfo.error && ` -- ${fileInfo.error}`}
                  {fileInfo.assetId && ' -- Uploaded'}
                  {fileInfo.textContent && !fileInfo.assetId && !fileInfo.uploading && !fileInfo.error && ' -- Ready'}
                </p>
              </div>
              {fileInfo.uploading ? (
                <FiLoader className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
              ) : fileInfo.assetId ? (
                <FiCheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
              ) : fileInfo.error ? (
                <FiAlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              ) : null}
              <button
                onClick={(e) => { e.stopPropagation(); onFileRemove(idx) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                disabled={disabled}
              >
                <FiX className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Input mode tabs ---
function InputModeTabs({
  mode,
  onModeChange,
}: {
  mode: 'paste' | 'upload'
  onModeChange: (mode: 'paste' | 'upload') => void
}) {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 w-fit">
      <button
        onClick={() => onModeChange('paste')}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
          mode === 'paste'
            ? 'bg-white text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Paste
      </button>
      <button
        onClick={() => onModeChange('upload')}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
          mode === 'upload'
            ? 'bg-white text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <FiUploadCloud className="h-3 w-3" />
        Upload
      </button>
    </div>
  )
}

// --- Build document text for clipboard ---
function buildDocumentText(doc: IntakeDocument): string {
  const parts: string[] = []
  if (doc.document_title) parts.push(`# ${doc.document_title}`)
  if (doc.generation_date) parts.push(`Generated: ${doc.generation_date}`)
  if (Array.isArray(doc.data_sources) && doc.data_sources.length > 0) {
    parts.push(`Data Sources: ${doc.data_sources.join(', ')}`)
  }
  parts.push('')
  if (doc.executive_summary) {
    parts.push('## Executive Summary')
    parts.push(doc.executive_summary)
    parts.push('')
  }
  for (const section of DOCUMENT_SECTIONS) {
    const content = doc[section.key]
    if (typeof content === 'string' && content) {
      parts.push(`## ${section.title}`)
      parts.push(content)
      parts.push('')
    }
  }
  const clarifications = Array.isArray(doc.needs_clarification) ? doc.needs_clarification : []
  if (clarifications.length > 0) {
    parts.push('## Needs Clarification')
    clarifications.forEach((item, i) => {
      parts.push(`${i + 1}. [${item?.priority ?? 'Unknown'}] ${item?.category ?? 'General'}: ${item?.description ?? ''}`)
    })
  }
  return parts.join('\n')
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function Page() {
  // --- Form state ---
  const [formData, setFormData] = useState({
    channel: '',
    transcripts: '',
    notes: '',
  })

  // --- File upload state ---
  const [transcriptFiles, setTranscriptFiles] = useState<UploadedFileInfo[]>([])
  const [noteFiles, setNoteFiles] = useState<UploadedFileInfo[]>([])
  const [transcriptInputMode, setTranscriptInputMode] = useState<'paste' | 'upload'>('upload')
  const [noteInputMode, setNoteInputMode] = useState<'paste' | 'upload'>('upload')

  // --- App state ---
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [document, setDocument] = useState<IntakeDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sampleData, setSampleData] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  // --- Agent Activity ---
  const agentActivity = useLyzrAgentEvents(sessionId)

  // --- Loading step animation ---
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (loading) {
      setLoadingStep(0)
      stepIntervalRef.current = setInterval(() => {
        setLoadingStep(prev => {
          if (prev < LOADING_STEPS.length - 1) return prev + 1
          return prev
        })
      }, 4000)
    } else {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
        stepIntervalRef.current = null
      }
    }
    return () => {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
      }
    }
  }, [loading])

  // --- Sample data toggle ---
  useEffect(() => {
    if (sampleData) {
      setFormData(SAMPLE_FORM)
      setDocument(SAMPLE_DOCUMENT)
      setError(null)
      setTranscriptFiles([])
      setNoteFiles([])
    } else {
      setFormData({ channel: '', transcripts: '', notes: '' })
      setDocument(null)
      setError(null)
      setTranscriptFiles([])
      setNoteFiles([])
    }
  }, [sampleData])

  // --- File upload handlers ---
  const processAndUploadFiles = useCallback(async (
    newFiles: File[],
    setFiles: React.Dispatch<React.SetStateAction<UploadedFileInfo[]>>
  ) => {
    const validFiles = newFiles.filter(f => {
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) return false
      return true
    })

    if (validFiles.length === 0) return

    // Create initial file entries
    const newEntries: UploadedFileInfo[] = validFiles.map(f => ({
      file: f,
      name: f.name,
      size: formatFileSize(f.size),
      textContent: null,
      assetId: null,
      uploading: true,
      error: null,
    }))

    setFiles(prev => [...prev, ...newEntries])

    // Process each file: read text + upload
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]

      // Read text content client-side
      const textContent = await readFileAsText(file)

      // Upload to server for asset_id
      try {
        const uploadResult = await uploadFiles(file)
        const assetId = uploadResult.success && uploadResult.asset_ids.length > 0
          ? uploadResult.asset_ids[0]
          : null

        setFiles(prev => {
          const updated = [...prev]
          // Find the matching entry (by matching name + uploading state from the end)
          const entryIdx = updated.findLastIndex(
            e => e.name === file.name && e.uploading
          )
          if (entryIdx !== -1) {
            updated[entryIdx] = {
              ...updated[entryIdx],
              textContent,
              assetId,
              uploading: false,
              error: uploadResult.success ? null : (uploadResult.error ?? 'Upload failed'),
            }
          }
          return updated
        })
      } catch (err) {
        setFiles(prev => {
          const updated = [...prev]
          const entryIdx = updated.findLastIndex(
            e => e.name === file.name && e.uploading
          )
          if (entryIdx !== -1) {
            updated[entryIdx] = {
              ...updated[entryIdx],
              textContent,
              assetId: null,
              uploading: false,
              error: 'Upload failed',
            }
          }
          return updated
        })
      }
    }
  }, [])

  const handleTranscriptFilesAdd = useCallback((files: File[]) => {
    processAndUploadFiles(files, setTranscriptFiles)
  }, [processAndUploadFiles])

  const handleNoteFilesAdd = useCallback((files: File[]) => {
    processAndUploadFiles(files, setNoteFiles)
  }, [processAndUploadFiles])

  const handleTranscriptFileRemove = useCallback((index: number) => {
    setTranscriptFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleNoteFileRemove = useCallback((index: number) => {
    setNoteFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  // --- Generate handler ---
  const handleGenerate = useCallback(async () => {
    const channelValue = formData.channel.trim()
    if (!channelValue) return

    setLoading(true)
    setError(null)
    setDocument(null)
    setActiveAgentId(MANAGER_AGENT_ID)
    agentActivity.setProcessing(true)

    // Build transcript content from paste + uploaded files
    const pastedTranscripts = transcriptInputMode === 'paste' ? formData.transcripts.trim() : ''
    const fileTranscriptTexts = transcriptFiles
      .filter(f => f.textContent)
      .map(f => `--- File: ${f.name} ---\n${f.textContent}`)
      .join('\n\n')
    const allTranscripts = [pastedTranscripts, fileTranscriptTexts].filter(Boolean).join('\n\n')

    // Build notes content from paste + uploaded files
    const pastedNotes = noteInputMode === 'paste' ? formData.notes.trim() : ''
    const fileNoteTexts = noteFiles
      .filter(f => f.textContent)
      .map(f => `--- File: ${f.name} ---\n${f.textContent}`)
      .join('\n\n')
    const allNotes = [pastedNotes, fileNoteTexts].filter(Boolean).join('\n\n')

    // Collect all asset IDs from uploaded files
    const allAssetIds = [
      ...transcriptFiles.filter(f => f.assetId).map(f => f.assetId!),
      ...noteFiles.filter(f => f.assetId).map(f => f.assetId!),
    ]

    // Build file attachment summary
    const transcriptFileNames = transcriptFiles.map(f => f.name)
    const noteFileNames = noteFiles.map(f => f.name)
    const fileAttachmentInfo = [
      transcriptFileNames.length > 0 ? `Uploaded transcript files: ${transcriptFileNames.join(', ')}` : '',
      noteFileNames.length > 0 ? `Uploaded notes files: ${noteFileNames.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const message = `Slack Channel: ${channelValue}
Meeting Transcripts: ${allTranscripts || 'None provided'}
Raw Meeting Notes: ${allNotes || 'None provided'}
${fileAttachmentInfo ? `\n${fileAttachmentInfo}` : ''}

Please generate a comprehensive Project Intake Document from the above information.`

    try {
      const result = await callAIAgent(message, MANAGER_AGENT_ID, {
        assets: allAssetIds.length > 0 ? allAssetIds : undefined,
      })

      if (result?.session_id) {
        setSessionId(result.session_id)
      }

      if (result?.success) {
        const parsed = parseAgentResponse(result)
        if (parsed) {
          setDocument(parsed)
        } else {
          setError('Failed to parse the agent response. The response format was unexpected.')
        }
      } else {
        setError(result?.error ?? result?.response?.message ?? 'Failed to generate the intake document. Please try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
      agentActivity.setProcessing(false)
    }
  }, [formData, agentActivity, transcriptInputMode, noteInputMode, transcriptFiles, noteFiles])

  // --- Copy handler ---
  const handleCopy = useCallback(async () => {
    if (!document) return
    const text = buildDocumentText(document)
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [document])

  // --- Export handler ---
  const handleExport = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [])

  // --- Derived ---
  const hasAnyUploading = transcriptFiles.some(f => f.uploading) || noteFiles.some(f => f.uploading)
  const canGenerate = formData.channel.trim().length > 0 && !loading && !hasAnyUploading
  const clarifications = Array.isArray(document?.needs_clarification) ? document.needs_clarification : []
  const dataSources = Array.isArray(document?.data_sources) ? document.data_sources : []

  return (
    <div style={THEME_VARS} className="min-h-screen bg-gradient-to-br from-[hsl(210,20%,97%)] via-[hsl(220,25%,95%)] to-[hsl(230,15%,97%)]">
      {/* --- Print-only styles --- */}
      <div id="print-styles" dangerouslySetInnerHTML={{ __html: `<style media="print">
        @page { margin: 1in; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        body { background: white !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>` }} />

      {/* --- Header --- */}
      <header className="no-print sticky top-0 z-30 backdrop-blur-xl bg-white/70 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-primary-foreground">
              <FiFileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif font-semibold text-lg text-foreground tracking-tight leading-tight">Project Intake Intelligence</h1>
              <p className="text-xs text-muted-foreground">AI-powered project intake document generator</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer select-none">Sample Data</Label>
            <Switch id="sample-toggle" checked={sampleData} onCheckedChange={setSampleData} />
          </div>
        </div>
      </header>

      {/* --- Main Layout --- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* --- Left Column: Inputs (40%) --- */}
          <div className="no-print w-full lg:w-[40%] lg:shrink-0">
            <div className="sticky top-24 space-y-5">
              {/* Input Card */}
              <Card className="backdrop-blur-[16px] bg-white/75 border border-white/[0.18] shadow-md">
                <CardHeader className="pb-4">
                  <CardTitle className="font-serif text-base tracking-tight flex items-center gap-2">
                    <FiClipboard className="h-4 w-4 text-primary" />
                    Project Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Slack Channel */}
                  <div className="space-y-2">
                    <Label htmlFor="channel" className="text-sm font-medium flex items-center gap-1.5">
                      <FiHash className="h-3.5 w-3.5 text-muted-foreground" />
                      Slack Channel <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="channel"
                      placeholder="Enter Slack channel name (e.g., #project-kickoff)"
                      value={formData.channel}
                      onChange={(e) => setFormData(prev => ({ ...prev, channel: e.target.value }))}
                      className="bg-white/80"
                    />
                  </div>

                  {/* Meeting Transcripts */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <FiFileText className="h-3.5 w-3.5 text-muted-foreground" />
                        Meeting Transcripts
                      </Label>
                      <InputModeTabs mode={transcriptInputMode} onModeChange={setTranscriptInputMode} />
                    </div>
                    {transcriptInputMode === 'paste' ? (
                      <Textarea
                        id="transcripts"
                        placeholder="Paste meeting transcripts here (optional)..."
                        value={formData.transcripts}
                        onChange={(e) => setFormData(prev => ({ ...prev, transcripts: e.target.value }))}
                        rows={5}
                        className="bg-white/80 resize-y"
                      />
                    ) : (
                      <FileUploadZone
                        label="transcript files"
                        icon={<FiFileText className="h-4 w-4" />}
                        files={transcriptFiles}
                        onFilesAdd={handleTranscriptFilesAdd}
                        onFileRemove={handleTranscriptFileRemove}
                        disabled={loading}
                      />
                    )}
                  </div>

                  {/* Meeting Notes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <FiClipboard className="h-3.5 w-3.5 text-muted-foreground" />
                        Meeting Notes
                      </Label>
                      <InputModeTabs mode={noteInputMode} onModeChange={setNoteInputMode} />
                    </div>
                    {noteInputMode === 'paste' ? (
                      <Textarea
                        id="notes"
                        placeholder="Paste raw meeting notes here (optional)..."
                        value={formData.notes}
                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        rows={5}
                        className="bg-white/80 resize-y"
                      />
                    ) : (
                      <FileUploadZone
                        label="note files"
                        icon={<FiClipboard className="h-4 w-4" />}
                        files={noteFiles}
                        onFilesAdd={handleNoteFilesAdd}
                        onFileRemove={handleNoteFileRemove}
                        disabled={loading}
                      />
                    )}
                  </div>

                  {/* Generate Button */}
                  <Button
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full h-11 font-medium text-sm"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <FiLoader className="h-4 w-4 animate-spin" />
                        Generating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <FiZap className="h-4 w-4" />
                        Generate Intake Document
                      </span>
                    )}
                  </Button>

                  {error && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-sm text-destructive flex items-start gap-2">
                        <FiAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        {error}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Agent Info Card */}
              <Card className="backdrop-blur-[16px] bg-white/75 border border-white/[0.18] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent Pipeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {AGENTS.map((agent) => {
                    const isActive = activeAgentId === agent.id || agentActivity.activeAgentId === agent.id
                    return (
                      <div key={agent.id} className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${isActive ? 'bg-primary/5' : ''}`}>
                        <div className={`h-2 w-2 rounded-full shrink-0 ${isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{agent.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{agent.role}</p>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {/* Agent Activity Panel */}
              <AgentActivityPanel
                isConnected={agentActivity.isConnected}
                events={agentActivity.events}
                thinkingEvents={agentActivity.thinkingEvents}
                lastThinkingMessage={agentActivity.lastThinkingMessage}
                activeAgentId={agentActivity.activeAgentId}
                activeAgentName={agentActivity.activeAgentName}
                isProcessing={agentActivity.isProcessing}
              />
            </div>
          </div>

          {/* --- Right Column: Output (60%) --- */}
          <div className="w-full lg:w-[60%] min-w-0">
            <Card className="backdrop-blur-[16px] bg-white/75 border border-white/[0.18] shadow-md min-h-[600px]">
              {/* Document Header / Action Bar */}
              {document && !loading && (
                <div className="no-print sticky top-[73px] z-20 flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-md border-b border-border rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <FiCheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700">Document Ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopy} className="text-xs gap-1.5 h-8">
                      {copied ? <FiCheckCircle className="h-3.5 w-3.5 text-green-600" /> : <FiCopy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport} className="text-xs gap-1.5 h-8">
                      <FiDownload className="h-3.5 w-3.5" />
                      Export PDF
                    </Button>
                  </div>
                </div>
              )}

              {/* Content Area */}
              <ScrollArea className="h-auto">
                <div className="p-5 sm:p-6">
                  {/* Loading State */}
                  {loading && <LoadingStepper currentStep={loadingStep} />}

                  {/* Empty State */}
                  {!loading && !document && !error && <EmptyState />}

                  {/* Document Display */}
                  {!loading && document && (
                    <div className="space-y-5">
                      {/* Document Title & Meta */}
                      <div className="text-center pb-4">
                        <h2 className="font-serif font-bold text-xl sm:text-2xl text-foreground tracking-tight leading-tight">
                          {document.document_title ?? 'Project Intake Document'}
                        </h2>
                        <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                          {document.generation_date && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <FiClock className="h-3 w-3" />
                              {document.generation_date}
                            </Badge>
                          )}
                          {document.processing_status && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {document.processing_status}
                            </Badge>
                          )}
                        </div>
                        {dataSources.length > 0 && (
                          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                            {dataSources.map((src, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs text-muted-foreground">
                                {src}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Executive Summary */}
                      {document.executive_summary && (
                        <div className="p-5 rounded-xl bg-primary/[0.03] border border-primary/10">
                          <div className="flex items-center gap-2 mb-3">
                            <FiBookOpen className="h-4 w-4 text-primary" />
                            <h3 className="font-serif font-semibold text-sm text-foreground tracking-tight">Executive Summary</h3>
                          </div>
                          {renderMarkdown(document.executive_summary)}
                        </div>
                      )}

                      {/* Needs Clarification Banner */}
                      <ClarificationBanner items={clarifications} />

                      {/* Document Sections */}
                      <div className="space-y-3">
                        {DOCUMENT_SECTIONS.map((section) => (
                          <DocumentSection
                            key={section.key}
                            section={section}
                            content={document[section.key] as string | undefined}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
