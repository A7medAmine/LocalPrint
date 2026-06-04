import React, { useState, useEffect, useRef } from "react";
import { Language, PrintJob, PrintStatus, PaymentStatus, ShopSettings, DiscountRule, DiscountType, ConditionType, PaperType } from "../types";
import { TRANSLATIONS } from "../constants";
import { storageService } from "../services/storageService";
import {
  calculatePrintPrice,
  getActualPageCount,
  formatPrice,
  calculateCustomerTotal,
  calculateJobDiscount,
  calculateCustomerTotalWithDiscounts,
} from "../utils/pricingUtils";
import { formatRelativeTime } from "../utils/timeUtils";
import ImageEditor from "../components/ImageEditor";
import { toast } from "../components/ui/use-toast";
import { Toaster } from "../components/ui/toaster";
import LanguageToggle from "../components/LanguageToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import PreviewModal from "../components/preview/PreviewModal";

interface AdminViewProps {
  lang: Language;
  onLogout: () => void;
  onSettingsUpdate: (settings: ShopSettings) => void;
  currentSettings: ShopSettings;
}

interface CustomerGroup {
  key: string;
  customerName: string;
  phoneNumber: string;
  jobs: PrintJob[];
  latestDate: string;
}

const AdminView: React.FC<AdminViewProps> = ({
  lang,
  onLogout,
  onSettingsUpdate,
  currentSettings,
}) => {
  const t = (key: string) => {
    if (!TRANSLATIONS[key]) {
      console.warn(`Missing translation key: ${key}`);
      return key;
    }
    return TRANSLATIONS[key][lang] || TRANSLATIONS[key]["en"] || key;
  };

  const isRtl = lang === "ar";

  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [singleDeleteConfirm, setSingleDeleteConfirm] = useState<string | null>(null);

  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"jobs" | "settings" | "gmail">("jobs");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

  const [editingJob, setEditingJob] = useState<PrintJob | null>(null);
  const [editingBlob, setEditingBlob] = useState<Blob | null>(null);

  const [shopName, setShopName] = useState(currentSettings.shopName);
  const [logoUrl, setLogoUrl] = useState<string | null>(currentSettings.logoUrl);
  const [paperTypes, setPaperTypes] = useState<PaperType[]>(
    currentSettings.paperTypes && currentSettings.paperTypes.length > 0
      ? currentSettings.paperTypes
      : [
          { id: "normal", name: "Normal", nameAr: "عادي", colorPerPage: currentSettings.pricing?.colorPerPage || 30.0, blackWhitePerPage: currentSettings.pricing?.blackWhitePerPage || 15.0 },
          { id: "glossy", name: "Glossy", nameAr: "لامع", colorPerPage: currentSettings.pricing?.glossyPerPage || 50.0, blackWhitePerPage: currentSettings.pricing?.glossyPerPage || 50.0 },
          { id: "cardboard", name: "Cardboard", nameAr: "ورق مقوى", colorPerPage: currentSettings.pricing?.cardboardPerPage || 40.0, blackWhitePerPage: currentSettings.pricing?.cardboardPerPage || 40.0 },
        ]
  );
  const [editingPaperTypeId, setEditingPaperTypeId] = useState<string | null>(null);
  const [editingPaperTypeForm, setEditingPaperTypeForm] = useState<{ name: string; nameAr: string; colorPerPage: number; blackWhitePerPage: number } | null>(null);
  const [showAddPaperTypeForm, setShowAddPaperTypeForm] = useState(false);
  const [newPaperTypeForm, setNewPaperTypeForm] = useState({ name: "", nameAr: "", colorPerPage: 30, blackWhitePerPage: 15 });
  const [showPasswords, setShowPasswords] = useState({ current: false, newPass: false, confirm: false });
  const [jobPageCounts, setJobPageCounts] = useState<{ [jobId: string]: number }>({});
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([]);

  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailClientId, setGmailClientId] = useState("");
  const [gmailClientSecret, setGmailClientSecret] = useState("");
  const [gmailHasSecret, setGmailHasSecret] = useState(false);
  const [gmailPolling, setGmailPolling] = useState(false);
  const [gmailDisconnectConfirm, setGmailDisconnectConfirm] = useState(false);
  const [gmailPollResult, setGmailPollResult] = useState<string | null>(null);
  const [gmailPending, setGmailPending] = useState<any[]>([]);
  const [gmailSelectedIds, setGmailSelectedIds] = useState<Set<number>>(new Set());
  const [gmailImporting, setGmailImporting] = useState(false);
  const [gmailShowCredentials, setGmailShowCredentials] = useState(false);
  const [gmailLastPolledAt, setGmailLastPolledAt] = useState<string | null>(null);
  const [gmailIsPolling, setGmailIsPolling] = useState(false);
  const [gmailReviewOpen, setGmailReviewOpen] = useState(false);
  const [gmailFilterText, setGmailFilterText] = useState("");
  const [gmailFilterDate, setGmailFilterDate] = useState<"today" | "week" | "all">("all");
  const [gmailFilterType, setGmailFilterType] = useState<"all" | "pdf" | "images" | "other">("all");
  const [gmailReviewOverrides, setGmailReviewOverrides] = useState<Record<string, { copies: number; colorMode: string; paperType: string }>>({});

  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [paymentEditJob, setPaymentEditJob] = useState<PrintJob | null>(null);
  const [paymentEditStatus, setPaymentEditStatus] = useState<string>(PaymentStatus.UNPAID);
  const [paymentEditAmount, setPaymentEditAmount] = useState<number>(0);
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [editingCopiesJobId, setEditingCopiesJobId] = useState<string | null>(null);
  const [savingPrefsJobId, setSavingPrefsJobId] = useState<string | null>(null);
  const [editingCopiesValue, setEditingCopiesValue] = useState<number>(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [isEditingRule, setIsEditingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleFormData, setRuleFormData] = useState<Partial<DiscountRule>>({
    name: "",
    discount_type: "percent",
    discount_value: 10,
    condition_type: "pages",
    threshold: 50,
    max_discount_cap: null,
    priority: 0,
    is_active: true,
  });
  const [deleteRuleConfirm, setDeleteRuleConfirm] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handlePreview = async (job: PrintJob) => {
    const url = await storageService.getFileUrl(job.id);
    if (url) {
      setPreviewJob(job);
      setPreviewUrl(url);
    }
  };

  const gmailPendingCountRef = useRef(0);

  const toggleNoteExpand = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadGmailStatus = async () => {
    try {
      const [status, settings] = await Promise.all([
        storageService.getGmailStatus(),
        storageService.getGmailSettings(),
      ]);
      setGmailConnected(status.connected);
      setGmailEmail(status.email || "");
      setGmailClientId(settings.clientId || "");
      setGmailHasSecret(settings.hasClientSecret || false);
      setGmailReplyTemplate(settings.replyTemplate || "");
    } catch (err) {
      console.error("Failed to load Gmail status:", err);
    }
  };

  const loadGmailPending = async () => {
    try {
      const pending = await storageService.getGmailPending();
      setGmailPending(pending);
      gmailPendingCountRef.current = pending.length;
    } catch (err) {
      console.error("Failed to load pending emails:", err);
    }
  };

  const toggleGmailSelection = (id: number) => {
    setGmailSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGmailSelectAll = () => {
    if (gmailSelectedIds.size === gmailPending.length) {
      setGmailSelectedIds(new Set());
    } else {
      setGmailSelectedIds(new Set(gmailPending.map(p => p.id)));
    }
  };

  const toggleGmailFilteredSelectAll = () => {
    const filteredIds = gmailFilteredPending.map(p => p.id);
    const allFilteredSelected = filteredIds.every(id => gmailSelectedIds.has(id));
    if (allFilteredSelected) {
      setGmailSelectedIds(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setGmailSelectedIds(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleGmailConnect = async () => {
    try {
      const url = await storageService.getGmailAuthUrl();
      const popup = window.open(url, 'gmail-auth', 'width=600,height=700');
      const pollTimer = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(pollTimer);
          await loadGmailStatus();
        }
      }, 1000);
    } catch (err) {
      console.error("Failed to connect Gmail:", err);
    }
  };

  const handleGmailDisconnect = () => {
    setGmailDisconnectConfirm(true);
  };

  const confirmGmailDisconnect = async () => {
    setGmailDisconnectConfirm(false);
    try {
      await storageService.disconnectGmail();
      setGmailConnected(false);
      setGmailEmail("");
      toast({ title: isRtl ? "تم قطع الاتصال بـ Gmail" : "Gmail disconnected", variant: "success" });
    } catch (err) {
      toast({ title: isRtl ? "فشل قطع الاتصال" : "Failed to disconnect", variant: "destructive" });
    }
  };

  const handleGmailPoll = async () => {
    if (gmailPolling) return;
    setGmailPolling(true);
    try {
      await storageService.triggerGmailPoll();
      await loadGmailPending();
    } catch (err) {
      console.error("Failed to poll Gmail:", err);
    } finally {
      setGmailPolling(false);
    }
  };

  const handleSaveGmailSettings = async () => {
    try {
      await storageService.saveGmailSettings(gmailClientId, gmailClientSecret);
      setGmailHasSecret(true);
      toast({ title: isRtl ? "تم حفظ إعدادات Gmail" : "Gmail settings saved", variant: "success" });
    } catch (err) {
      toast({ title: isRtl ? "فشل حفظ الإعدادات" : "Failed to save settings", variant: "destructive" });
    }
  };

  const gmailFilteredPending = gmailPending.filter(e => {
    if (gmailFilterText) {
      const q = gmailFilterText.toLowerCase();
      const matchesText = (e.email_from || '').toLowerCase().includes(q) ||
        (e.email_address || '').toLowerCase().includes(q) ||
        (e.subject || '').toLowerCase().includes(q);
      if (!matchesText) return false;
    }
    if (gmailFilterDate === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fetched = new Date(e.fetched_at || e.received_at || 0);
      if (fetched < today) return false;
    } else if (gmailFilterDate === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const fetched = new Date(e.fetched_at || e.received_at || 0);
      if (fetched < weekAgo) return false;
    }
    if (gmailFilterType !== 'all') {
      const atts = e.attachment_meta || [];
      if (atts.length === 0) return gmailFilterType === 'other';
      const hasMatch = atts.some((att: any) => {
        const mt = (att.mimeType || '').toLowerCase();
        if (gmailFilterType === 'pdf') return mt.includes('pdf');
        if (gmailFilterType === 'images') return mt.includes('image');
        return !mt.includes('pdf') && !mt.includes('image');
      });
      if (!hasMatch) return false;
    }
    return true;
  });
  const gmailSelectedEmails = gmailPending.filter(e => gmailSelectedIds.has(e.id));

  const handleGmailImportSelected = async () => {
    if (gmailSelectedIds.size === 0) return;
    const defaults: Record<string, { copies: number; colorMode: string; paperType: string }> = {};
    for (const email of gmailSelectedEmails) {
      for (let i = 0; i < (email.attachment_meta || []).length; i++) {
        defaults[`${email.id}_${i}`] = { copies: 1, colorMode: 'color', paperType: 'normal' };
      }
    }
    setGmailReviewOverrides(defaults);
    setGmailReviewOpen(true);
  };

  const handleGmailConfirmImport = async () => {
    setGmailReviewOpen(false);
    setGmailImporting(true);
    try {
      const result = await storageService.importGmailEmails(Array.from(gmailSelectedIds), gmailReviewOverrides);
      const imported = result.imported || [];
      const successCount = imported.filter((r: any) => !r.error).length;
      const errorCount = imported.filter((r: any) => r.error).length;
      if (errorCount > 0) {
        const errors = imported.filter((r: any) => r.error).map((r: any) => `${r.subject || r.id}: ${r.error}`).join("; ");
        toast({ title: `${successCount} imported, ${errorCount} failed`, description: errors, variant: "destructive" });
      } else {
        toast({ title: `${successCount} email(s) imported`, variant: "success" });
      }
      setGmailSelectedIds(new Set());
      await loadGmailPending();
      await loadJobs();
    } catch (err: any) {
      console.error("Failed to import emails:", err);
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setGmailImporting(false);
    }
  };

  const updateGmailOverride = (key: string, field: string, value: any) => {
    setGmailReviewOverrides(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleGmailDiscardSelected = async () => {
    const ids = Array.from(gmailSelectedIds);
    for (const id of ids) {
      try {
        await storageService.discardGmailEmail(id);
      } catch (err) {
        console.error("Failed to discard email:", err);
      }
    }
    setGmailSelectedIds(new Set());
    await loadGmailPending();
    toast({
      title: `${ids.length} email(s) discarded`,
      duration: 5000,
    });
  };

  const [gmailReplyTemplate, setGmailReplyTemplate] = useState("");

  const handleSaveReplyTemplate = async () => {
    try {
      await storageService.saveGmailReplyTemplate(gmailReplyTemplate);
      toast({ title: isRtl ? "تم حفظ قالب الرد" : "Reply template saved", variant: "success" });
    } catch (err) {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const getFileTypeIcon = (mimeType: string) => {
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("image")) return "🖼️";
    if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "📊";
    if (mimeType.includes("powerpoint") || mimeType.includes("presentation")) return "📽️";
    return "📎";
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  useEffect(() => {
    loadJobs();
    loadDiscountRules();
    loadGmailStatus();
    loadGmailPending();

    const es = new EventSource('/api/events');
    es.addEventListener("gmail-new", () => { loadGmailPending(); });
    es.addEventListener("new-job", () => { loadJobs(); });
    es.onerror = () => {};
    return () => { es.close(); };
  }, []);

  useEffect(() => {
    setShopName(currentSettings.shopName);
    setLogoUrl(currentSettings.logoUrl);
    if (currentSettings.paperTypes && currentSettings.paperTypes.length > 0) {
      setPaperTypes(currentSettings.paperTypes);
    }
  }, [currentSettings]);

  const loadJobs = async () => {
    setLoading(true);
    const data = await storageService.getMetadata();
    const grouped = data.reduce(
      (acc: { [key: string]: CustomerGroup }, job) => {
        const name = job.customerName?.trim() || "";
        const phone = job.phoneNumber?.trim() || "";
        let key = `${name}-${phone}`;
        if (!name && !phone) {
          const timeKey = new Date(job.uploadDate).toISOString().slice(0, 16);
          key = `anon-${timeKey}`;
        }
        if (!acc[key]) {
          acc[key] = { key, customerName: name, phoneNumber: phone, jobs: [], latestDate: job.uploadDate };
        }
        acc[key].jobs.push(job);
        if (new Date(job.uploadDate) > new Date(acc[key].latestDate)) {
          acc[key].latestDate = job.uploadDate;
        }
        return acc;
      }, {},
    );
    const sortedGroups = Object.values(grouped).sort(
      (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime(),
    );
    sortedGroups.forEach((group) => {
      group.jobs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
    });
    setGroups(sortedGroups);
    setLoading(false);
    countPagesForAllJobs(sortedGroups);
  };

  const countPagesForAllJobs = async (groups: CustomerGroup[]) => {
    const pageCounts: { [jobId: string]: number } = {};
    for (const group of groups) {
      for (const job of group.jobs) {
        if (job.pageCount && job.pageCount > 0) {
          pageCounts[job.id] = job.pageCount;
        }
      }
    }
    for (const group of groups) {
      for (const job of group.jobs) {
        if (pageCounts[job.id]) continue;
        try {
          const url = await storageService.getFileUrl(job.id);
          if (url) {
            const response = await fetch(url);
            const blob = await response.blob();
            const file = new File([blob], job.fileName, { type: job.fileType });
            const pageCount = await getActualPageCount(file);
            pageCounts[job.id] = pageCount;
          } else {
            pageCounts[job.id] = 1;
          }
        } catch (error) {
          console.error(`Error counting pages for job ${job.id}:`, error);
          pageCounts[job.id] = 1;
        }
      }
    }
    setJobPageCounts(pageCounts);
  };

  const loadDiscountRules = async () => {
    try {
      const rules = await storageService.getDiscountRules();
      setDiscountRules(rules);
    } catch (err) {
      console.error("Failed to load discount rules:", err);
    }
  };

  const handleAddRule = () => {
    setIsEditingRule(false);
    setEditingRule(null);
    setRuleFormData({ name: "", discount_type: "percent", discount_value: 10, condition_type: "pages", threshold: 50, max_discount_cap: null, priority: 0, is_active: true });
    setShowRuleForm(true);
  };

  const handleEditRule = (rule: DiscountRule) => {
    setIsEditingRule(true);
    setEditingRule(rule);
    setRuleFormData({ ...rule });
    setShowRuleForm(true);
  };

  const handleSaveRule = async () => {
    try {
      if (!ruleFormData.name || ruleFormData.discount_value === undefined || ruleFormData.threshold === undefined) {
        toast({ title: isRtl ? "يرجى ملء جميع الحقول المطلوبة" : "Please fill all required fields", variant: "destructive" });
        return;
      }
      const ruleData: DiscountRule = {
        id: isEditingRule && editingRule ? editingRule.id : Math.random().toString(36).substring(2, 9),
        name: ruleFormData.name!,
        discount_type: ruleFormData.discount_type as DiscountType,
        discount_value: Number(ruleFormData.discount_value),
        condition_type: ruleFormData.condition_type as ConditionType,
        threshold: Number(ruleFormData.threshold),
        max_discount_cap: ruleFormData.max_discount_cap ? Number(ruleFormData.max_discount_cap) : null,
        priority: Number(ruleFormData.priority) || 0,
        is_active: ruleFormData.is_active !== false,
      };
      if (isEditingRule && editingRule) {
        await storageService.updateDiscountRule(editingRule.id, ruleData);
        toast({ title: isRtl ? "تم تحديث القاعدة بنجاح" : "Rule updated successfully", variant: "success" });
      } else {
        await storageService.createDiscountRule(ruleData);
        toast({ title: isRtl ? "تم إنشاء القاعدة بنجاح" : "Rule created successfully", variant: "success" });
      }
      setShowRuleForm(false);
      loadDiscountRules();
    } catch (err) {
      console.error("Failed to save discount rule:", err);
      toast({ title: isRtl ? "فشل حفظ القاعدة" : "Failed to save rule", variant: "destructive" });
    }
  };

  const handleDeleteRule = async (id: string) => {
    setDeleteRuleConfirm(id);
  };

  const confirmDeleteRule = async () => {
    if (deleteRuleConfirm) {
      try {
        await storageService.deleteDiscountRule(deleteRuleConfirm);
        toast({ title: isRtl ? "تم حذف القاعدة بنجاح" : "Rule deleted successfully", variant: "success" });
        loadDiscountRules();
      } catch (err) {
        console.error("Failed to delete discount rule:", err);
        toast({ title: isRtl ? "فشل حذف القاعدة" : "Failed to delete rule", variant: "destructive" });
      }
      setDeleteRuleConfirm(null);
    }
  };

  const handleToggleRuleActive = async (rule: DiscountRule) => {
    try {
      await storageService.updateDiscountRule(rule.id, { is_active: !rule.is_active });
      loadDiscountRules();
      toast({ title: !rule.is_active ? (isRtl ? "تم تفعيل القاعدة" : "Rule activated") : (isRtl ? "تم تعطيل القاعدة" : "Rule deactivated"), variant: "success" });
    } catch (err) {
      console.error("Failed to toggle rule:", err);
      toast({ title: isRtl ? "فشل تحديث القاعدة" : "Failed to update rule", variant: "destructive" });
    }
  };

  const toggleGroup = (key: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(key)) newCollapsed.delete(key);
    else newCollapsed.add(key);
    setCollapsedGroups(newCollapsed);
  };

  const toggleSelectJob = (id: string) => {
    const newSelected = new Set(selectedJobIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedJobIds(newSelected);
  };

  const toggleSelectGroup = (jobs: PrintJob[], e: React.ChangeEvent<HTMLInputElement>) => {
    const jobIds = jobs.map((j) => j.id);
    const allSelectedInGroup = jobIds.every((id) => selectedJobIds.has(id));
    const newSelected = new Set(selectedJobIds);
    if (allSelectedInGroup) jobIds.forEach((id) => newSelected.delete(id));
    else jobIds.forEach((id) => newSelected.add(id));
    setSelectedJobIds(newSelected);
  };

  const handleDownload = async (job: PrintJob) => {
    const url = await storageService.getFileUrl(job.id);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = job.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  const handlePrint = async (job: PrintJob) => {
    const url = await storageService.getFileUrl(job.id);
    if (!url) return;
    if (job.fileType === "application/pdf") {
      window.open(url, "_blank");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      const title = escapeHtml(job.fileName);
      printWindow.document.write(`
        <html>
          <head><title>Print - ${title}</title></head>
          <body style="margin:0; display:flex; justify-content:center;">
            <img src="${url}" style="max-width:100%; max-height:100vh;" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleBulkPrint = async () => {
    const selectedJobs = groups.flatMap((g) => g.jobs).filter((j) => selectedJobIds.has(j.id));
    if (selectedJobs.length === 0) return;
    const images = selectedJobs.filter((j) => j.fileType.includes("image"));
    const pdfs = selectedJobs.filter((j) => j.fileType === "application/pdf");
    if (images.length > 0) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const doc = printWindow.document;
        doc.write("<!DOCTYPE html><html><head><title>Bulk Print Images</title></head><body style='margin:0'>");
        for (const img of images) {
          const url = await storageService.getFileUrl(img.id);
          const div = doc.createElement("div");
          div.style.cssText = "page-break-after:always;display:flex;justify-content:center;align-items:center;height:100vh";
          const imgEl = doc.createElement("img");
          imgEl.src = url;
          imgEl.style.cssText = "max-width:100%;max-height:100%";
          div.appendChild(imgEl);
          doc.body.appendChild(div);
        }
        const script = doc.createElement("script");
        script.textContent = "window.onload=function(){window.print();window.close()}";
        doc.body.appendChild(script);
        doc.close();
      }
    }
    for (const pdf of pdfs) {
      const url = await storageService.getFileUrl(pdf.id);
      if (url) window.open(url, "_blank");
    }
  };

  const handleBulkDownload = async () => {
    const selectedIds = Array.from(selectedJobIds);
    for (let i = 0; i < selectedIds.length; i++) {
      const job = groups.flatMap((g) => g.jobs).find((j) => j.id === selectedIds[i]);
      if (job) {
        await handleDownload(job);
        if (selectedIds.length > 1) await new Promise((r) => setTimeout(r, 200));
      }
    }
  };

  const handleBulkDelete = () => setBulkDeleteConfirm(true);

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedJobIds);
    try {
      await storageService.bulkDeleteJobs(ids);
      setSelectedJobIds(new Set());
      setBulkDeleteConfirm(false);
      loadJobs();
      toast({ title: isRtl ? `تم حذف ${ids.length} ملفات` : `${ids.length} files deleted successfully`, variant: "success" });
    } catch (err) {
      toast({ title: isRtl ? "فشل الحذف" : "Delete failed", variant: "destructive" });
    }
  };

  const handleBulkStatusUpdate = async (status: PrintStatus = PrintStatus.PRINTED) => {
    const ids = Array.from(selectedJobIds);
    try {
      await storageService.bulkUpdateStatus(ids, status);
      setSelectedJobIds(new Set());
      loadJobs();
      toast({ title: isRtl ? `تم تحديث ${ids.length} ملفات` : `${ids.length} files updated`, variant: "success" });
    } catch (err) {
      toast({ title: isRtl ? "فشل التحديث" : "Update failed", variant: "destructive" });
    }
  };

  const handleEdit = async (job: PrintJob) => {
    if (job.fileType.includes("pdf")) {
      sessionStorage.setItem("ps_edit_job", job.id);
      window.location.hash = "studio";
    } else {
      const url = await storageService.getFileUrl(job.id);
      if (url && job.fileType.includes("image")) {
        const res = await fetch(url);
        const blob = await res.blob();
        setEditingJob(job);
        setEditingBlob(blob);
      } else {
        toast({ title: isRtl ? "تحرير الصور متاح لملفات الصور فقط." : "Editing is only for image files.", variant: "destructive" });
      }
    }
  };

  const handleSaveEditedImage = async (newBlob: Blob) => {
    if (editingJob) {
      try {
        const file = new File([newBlob], editingJob.fileName, { type: newBlob.type });
        await storageService.updateJobFile(editingJob.id, file);
        setEditingJob(null);
        setEditingBlob(null);
        loadJobs();
        toast({ title: isRtl ? "تم تحديث الملف بنجاح" : "File updated successfully", variant: "success" });
      } catch (err) {
        console.error("Failed to update job file:", err);
        toast({ title: isRtl ? "فشل تحديث الملف." : "Failed to update file.", variant: "destructive" });
      }
    }
  };

  const handleStatusChange = async (jobId: string, newStatus: PrintStatus) => {
    await storageService.updateStatus(jobId, newStatus);
    loadJobs();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    if (passwordForm.newPass !== passwordForm.confirm) {
      setPasswordError(isRtl ? "كلمات المرور الجديدة غير متطابقة" : "New passwords do not match");
      return;
    }
    if (passwordForm.newPass.length < 4) {
      setPasswordError(isRtl ? "يجب أن تكون كلمة المرور 4 أحرف على الأقل" : "Password must be at least 4 characters");
      return;
    }
    try {
      await storageService.changePassword(passwordForm.current, passwordForm.newPass);
      setPasswordSuccess(true);
      setPasswordForm({ current: "", newPass: "", confirm: "" });
      toast({ title: isRtl ? "تم تغيير كلمة المرور بنجاح" : "Password changed successfully", variant: "success" });
    } catch {
      setPasswordError(isRtl ? "كلمة المرور الحالية غير صحيحة" : "Current password is incorrect");
    }
  };

  const handlePaymentClick = (job: PrintJob) => {
    setPaymentEditJob(job);
    setPaymentEditStatus(job.paymentStatus || PaymentStatus.UNPAID);
    setPaymentEditAmount(job.paymentAmount || 0);
  };

  const handleSavePayment = async () => {
    if (!paymentEditJob) return;
    try {
      await storageService.updatePaymentStatus(paymentEditJob.id, paymentEditStatus, paymentEditAmount);
      setPaymentEditJob(null);
      loadJobs();
      toast({ title: isRtl ? "تم تحديث حالة الدفع" : "Payment status updated", variant: "success" });
    } catch (err) {
      toast({ title: isRtl ? "فشل تحديث الدفع" : "Failed to update payment", variant: "destructive" });
    }
  };

  const handleBulkPaymentStatus = async (status: string) => {
    const ids = Array.from(selectedJobIds);
    try {
      await storageService.bulkUpdatePayment(ids, status);
      setSelectedJobIds(new Set());
      loadJobs();
      toast({ title: `${ids.length} ${isRtl ? "تم تحديث الدفع" : "payment(s) updated"}`, variant: "success" });
    } catch (err) {
      toast({ title: isRtl ? "فشل" : "Failed", variant: "destructive" });
    }
  };

  const handleBackupDownload = () => storageService.downloadBackup();

  const handleBackupRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      await storageService.restoreBackup(restoreFile);
      toast({ title: isRtl ? "تمت الاستعادة. إعادة تحميل..." : "Restored. Reloading...", variant: "success" });
      setBackupRestoreOpen(false);
      setRestoreFile(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast({ title: isRtl ? "فشل الاستعادة" : "Restore failed", description: err.message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = (id: string) => setSingleDeleteConfirm(id);

  const confirmSingleDelete = async () => {
    if (singleDeleteConfirm) {
      await storageService.deleteJob(singleDeleteConfirm);
      const newSelected = new Set(selectedJobIds);
      newSelected.delete(singleDeleteConfirm);
      setSelectedJobIds(newSelected);
      setSingleDeleteConfirm(null);
      loadJobs();
      toast({ title: isRtl ? "تم الحذف بنجاح" : "Deleted successfully", variant: "success" });
    }
  };

  const handlePaperTypeChange = async (job: PrintJob, newPaperType: string) => {
    if (savingPrefsJobId === job.id) return;
    const colorMode = job.printPreferences?.colorMode || "color";
    const copies = job.printPreferences?.copies || 1;
    setSavingPrefsJobId(job.id);
    try {
      await storageService.updateJobPreferences(job.id, { colorMode, copies, paperType: newPaperType });
      setGroups((prev) => prev.map((g) => ({ ...g, jobs: g.jobs.map((j) => j.id === job.id ? { ...j, printPreferences: { colorMode, copies, paperType: newPaperType } } : j) })));
    } catch (err) {
      console.error("Failed to update paper type", err);
    } finally {
      setSavingPrefsJobId(null);
    }
  };

  const handleToggleColorMode = async (job: PrintJob) => {
    if (savingPrefsJobId === job.id) return;
    const newMode = job.printPreferences?.colorMode === "blackWhite" ? "color" : "blackWhite";
    const newCopies = job.printPreferences?.copies || 1;
    const paperType = job.printPreferences?.paperType || "normal";
    setSavingPrefsJobId(job.id);
    try {
      await storageService.updateJobPreferences(job.id, { colorMode: newMode, copies: newCopies, paperType });
      setGroups((prev) => prev.map((g) => ({ ...g, jobs: g.jobs.map((j) => j.id === job.id ? { ...j, printPreferences: { colorMode: newMode, copies: newCopies, paperType } } : j) })));
    } catch (err) {
      console.error("Failed to update color mode", err);
    } finally {
      setSavingPrefsJobId(null);
    }
  };

  const handleSaveCopies = async (job: PrintJob, copies: number) => {
    if (savingPrefsJobId === job.id) return;
    const safeCopies = Math.max(1, Math.min(100, copies));
    const colorMode = job.printPreferences?.colorMode || "color";
    const paperType = job.printPreferences?.paperType || "normal";
    setSavingPrefsJobId(job.id);
    setEditingCopiesJobId(null);
    try {
      await storageService.updateJobPreferences(job.id, { colorMode, copies: safeCopies, paperType });
      setGroups((prev) => prev.map((g) => ({ ...g, jobs: g.jobs.map((j) => j.id === job.id ? { ...j, printPreferences: { colorMode, copies: safeCopies, paperType } } : j) })));
    } catch (err) {
      console.error("Failed to update copies", err);
    } finally {
      setSavingPrefsJobId(null);
    }
  };

  const getPaperTypeName = (id: string) => {
    const pt = paperTypes.find(p => p.id === id);
    if (!pt) return isRtl ? "عادي" : "Normal";
    return isRtl ? pt.nameAr : pt.name;
  };

  const handleAddPaperType = () => {
    if (!newPaperTypeForm.name.trim()) return;
    const newId = `pt_${Date.now()}`;
    const newPt: PaperType = { id: newId, name: newPaperTypeForm.name.trim(), nameAr: newPaperTypeForm.nameAr.trim() || newPaperTypeForm.name.trim(), colorPerPage: newPaperTypeForm.colorPerPage, blackWhitePerPage: newPaperTypeForm.blackWhitePerPage };
    setPaperTypes(prev => [...prev, newPt]);
    setShowAddPaperTypeForm(false);
    setNewPaperTypeForm({ name: "", nameAr: "", colorPerPage: 30, blackWhitePerPage: 15 });
    toast({ title: isRtl ? "تم إضافة نوع الورق. لا تنس حفظ الإعدادات!" : "Paper type added. Don't forget to save settings!", variant: "success" });
  };

  const handleSavePaperType = (id: string) => {
    if (!editingPaperTypeForm) return;
    setPaperTypes(prev => prev.map(pt => pt.id === id ? { ...pt, ...editingPaperTypeForm } : pt));
    setEditingPaperTypeId(null);
    setEditingPaperTypeForm(null);
  };

  const handleDeletePaperType = (id: string) => {
    setPaperTypes(prev => prev.filter(pt => pt.id !== id));
  };

  const saveSettings = async () => {
    await storageService.saveSettings({ shopName, paperTypes });
    onSettingsUpdate({ ...currentSettings, shopName, paperTypes });
    toast({ title: isRtl ? "تم الحفظ بنجاح" : "Settings saved successfully", variant: "success" });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const newLogoUrl = await storageService.uploadLogo(file);
        setLogoUrl(newLogoUrl);
        onSettingsUpdate({ ...currentSettings, logoUrl: newLogoUrl });
        toast({ title: isRtl ? "تم رفع الشعار بنجاح" : "Logo uploaded successfully", variant: "success" });
      } catch (err) {
        toast({ title: isRtl ? "فشل رفع الشعار" : "Failed to upload logo", variant: "destructive" });
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileExtension = (filename: string | null | undefined) => {
    if (!filename) return "";
    return filename.split(".").pop()?.toUpperCase() || "";
  };

  const isOfficeFile = (fileType: string | null | undefined) => {
    if (!fileType) return false;
    return fileType.includes("wordprocessingml.document") || fileType.includes("msword") || fileType.includes("spreadsheetml.sheet") || fileType.includes("ms-excel") || fileType.includes("presentationml.presentation") || fileType.includes("ms-powerpoint");
  };

  const getStatusBadgeStyle = (status: PrintStatus | undefined) => {
    switch (status) {
      case PrintStatus.PRINTED: return "bg-success-50 text-success-700 border-success-200";
      case PrintStatus.READY: return "bg-blue-50 text-blue-700 border-blue-200";
      default: return "bg-warning-50 text-warning-700 border-warning-200";
    }
  };

  const getPaymentBadgeStyle = (status: string | undefined) => {
    switch (status) {
      case PaymentStatus.PAID: return "bg-success-50 text-success-700 border-success-200";
      case PaymentStatus.PARTIAL: return "bg-warning-50 text-warning-700 border-warning-200";
      default: return "bg-danger-50 text-danger-700 border-danger-200";
    }
  };

  const navItems = [
    { id: "jobs", label: isRtl ? "طلبات الطباعة" : "Print Jobs", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    { id: "settings", label: isRtl ? "الإعدادات" : "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    { id: "gmail", label: isRtl ? "البريد الإلكتروني" : "Email", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  ];

  const allJobs = groups.flatMap(g => g.jobs);
  const pendingCount = allJobs.filter(j => j.status === PrintStatus.PENDING).length;
  const readyCount = allJobs.filter(j => j.status === PrintStatus.READY).length;
  const printedCount = allJobs.filter(j => j.status === PrintStatus.PRINTED).length;
  const totalCustomers = groups.length;

  const filteredGroups = searchQuery.trim()
    ? groups.filter((g) => g.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || g.phoneNumber.includes(searchQuery))
    : groups;

  const statusFilteredGroups = statusFilter !== "all"
    ? filteredGroups.map(g => ({...g, jobs: g.jobs.filter(j => j.status === statusFilter)})).filter(g => g.jobs.length > 0)
    : filteredGroups;

  return (
    <div className={`flex h-screen bg-[#F8FAFC] overflow-hidden${isRtl ? ' font-cairo' : ''}`} dir={isRtl ? "rtl" : "ltr"}>
      <Toaster />

      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 flex flex-col bg-white border-r border-[#E2E8F0] transition-all duration-300
        ${sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:static lg:translate-x-0
      `}>
        {/* Logo */}
        <div className={`flex items-center gap-3 h-16 px-4 border-b border-[#E2E8F0] flex-shrink-0 ${sidebarCollapsed ? 'justify-center px-0' : ''}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full rounded-xl object-cover" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>
          {!sidebarCollapsed && (
            <span className="text-[#0F172A] font-bold text-base tracking-tight truncate">{shopName || (isRtl ? "متجر الطباعة" : "Print Shop")}</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id as any); setMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-[#6366F1]/10 text-[#6366F1]'
                  : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d={item.icon} />
              </svg>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* User profile */}
        <div className={`p-3 border-t border-[#E2E8F0] ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {sidebarCollapsed ? (
            <div className="w-9 h-9 rounded-xl bg-[#6366F1]/10 text-[#6366F1] flex items-center justify-center text-sm font-bold cursor-default">
              A
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#6366F1]/10 text-[#6366F1] flex items-center justify-center text-sm font-bold flex-shrink-0">
                A
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F172A] truncate">{isRtl ? "المسؤول" : "Admin"}</p>
                <p className="text-xs text-[#64748B]">{isRtl ? "مدير المتجر" : "Shop Manager"}</p>
              </div>
              <div className="flex-shrink-0">
                <LanguageToggle currentLang={lang} onToggle={(newLang) => { localStorage.setItem("ps_language", newLang); window.location.reload(); }} />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex w-9 h-9 rounded-xl items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`}>
                <line x1="3" y1="12" x2="21" y2="12" /><polyline points="15 6 21 12 15 18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-[#0F172A] leading-tight">
                {activeTab === "jobs" ? (isRtl ? "طلبات الطباعة" : "Print Jobs") : activeTab === "settings" ? (isRtl ? "الإعدادات" : "Settings") : (isRtl ? "البريد الإلكتروني" : "Email")}
              </h1>
              <p className="text-xs text-[#64748B]">{isRtl ? "لوحة التحكم" : "Dashboard"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden lg:block">
              <LanguageToggle currentLang={lang} onToggle={(newLang) => { localStorage.setItem("ps_language", newLang); window.location.reload(); }} />
            </div>
            <button
              onClick={() => { sessionStorage.setItem("ps_edit_job", ""); window.location.hash = "studio"; }}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] transition-all duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              {isRtl ? "استوديو الطباعة" : "Print Studio"}
            </button>
            <button
              onClick={() => window.location.hash = ""}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {sidebarCollapsed ? '' : (isRtl ? "طلب جديد" : "New Print Job")}
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[#EF4444] hover:bg-[#FEF2F2] transition-all duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {sidebarCollapsed ? '' : <span className="hidden sm:inline">{isRtl ? "خروج" : "Logout"}</span>}
            </button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          {/* Image Editor */}
          {editingJob && editingBlob && (
            <div className="h-full">
              <ImageEditor
                imageBlob={editingBlob}
                lang={lang}
                onSave={handleSaveEditedImage}
                onCancel={() => { setEditingJob(null); setEditingBlob(null); }}
              />
            </div>
          )}

          {/* Bulk Action Bar */}
          {selectedJobIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideUp_0.2s_ease-out]">
              <div className="bg-white rounded-xl shadow-lg border border-[#E2E8F0] px-4 py-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-[#6366F1] text-white text-xs font-bold">
                  {selectedJobIds.size}
                </span>
                <div className="w-px h-6 bg-[#E2E8F0]" />
                <button onClick={handleBulkPrint} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "طباعة" : "Print"}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <button onClick={handleBulkDownload} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "تحميل" : "Download"}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                </button>
                <button onClick={() => handleBulkStatusUpdate(PrintStatus.READY)} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "تحديد كجاهز" : "Mark Ready"}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <button onClick={() => handleBulkStatusUpdate(PrintStatus.PRINTED)} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "تحديد كمطبوع" : "Mark Printed"}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className="w-px h-6 bg-[#E2E8F0]" />
                <button onClick={handleBulkDelete} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#EF4444] hover:bg-[#FEF2F2] transition-colors" title={isRtl ? "حذف" : "Delete"}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                </button>
                <button onClick={() => setSelectedJobIds(new Set())} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "إلغاء" : "Close"}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Jobs Tab */}
          {activeTab === "jobs" && !(editingJob && editingBlob) && (
            <div className="p-4 lg:p-6 space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: isRtl ? "قيد الانتظار" : "Pending", value: pendingCount, icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", color: "#F59E0B", bg: "#FFFBEB", helper: isRtl ? "بانتظار الطباعة" : "Awaiting printing" },
                  { label: isRtl ? "جاهز" : "Ready", value: readyCount, icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", color: "#22C55E", bg: "#F0FDF4", helper: isRtl ? "جاهز للاستلام" : "Ready for pickup" },
                  { label: isRtl ? "مطبوع" : "Printed", value: printedCount, icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", color: "#6366F1", bg: "#EEF2FF", helper: isRtl ? "تمت الطباعة" : "Printing completed" },
                  { label: isRtl ? "العملاء" : "Customers", value: totalCustomers, icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", color: "#3B82F6", bg: "#EFF6FF", helper: isRtl ? "إجمالي العملاء" : "Total customers" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white rounded-xl p-4 border border-[#E2E8F0] shadow-sm transition-all duration-200 hover:shadow-md">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: kpi.bg }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={kpi.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d={kpi.icon} />
                        </svg>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-[#0F172A]">{kpi.value}</p>
                    <p className="text-sm font-medium text-[#64748B]">{kpi.label}</p>
                    <p className="text-xs text-[#94A3B8] mt-0.5">{kpi.helper}</p>
                  </div>
                ))}
              </div>

              {/* Search & Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isRtl ? "بحث عن عميل..." : "Search customer..."}
                    className="w-full h-10 pl-10 pr-3 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all duration-200"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all duration-200"
                >
                  <option value="all">{isRtl ? "جميع الحالات" : "All Status"}</option>
                  <option value={PrintStatus.PENDING}>{isRtl ? "قيد الانتظار" : "Pending"}</option>
                  <option value={PrintStatus.READY}>{isRtl ? "جاهز" : "Ready"}</option>
                  <option value={PrintStatus.PRINTED}>{isRtl ? "مطبوع" : "Printed"}</option>
                </select>
              </div>

              {/* Content */}
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#F1F5F9]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-[#F1F5F9] rounded w-1/3" />
                          <div className="h-3 bg-[#F1F5F9] rounded w-1/4" />
                        </div>
                        <div className="h-8 w-20 bg-[#F1F5F9] rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : statusFilteredGroups.length === 0 ? (
                <div className="text-center py-16">
                  <div className="flex justify-center gap-6 mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-[#EEF2FF] flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-[#FFFBEB] flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-[#0F172A] mb-1">
                    {searchQuery || statusFilter !== "all"
                      ? (isRtl ? "لا توجد نتائج للبحث" : "No results found")
                      : (isRtl ? "لا توجد طلبات طباعة بعد" : "No print jobs yet")}
                  </h3>
                  <p className="text-sm text-[#64748B] mb-6">
                    {searchQuery || statusFilter !== "all"
                      ? (isRtl ? "حاول تعديل معايير البحث" : "Try adjusting search criteria")
                      : (isRtl ? "قم برفع ملف لبدء الطلب" : "Upload a file to get started")}
                  </p>
                  {!searchQuery && statusFilter === "all" && (
                    <button
                      onClick={() => window.location.hash = ""}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200 shadow-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                      {isRtl ? "رفع ملف" : "Upload File"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {statusFilteredGroups.map((group) => {
                    const total = calculateCustomerTotalWithDiscounts(group.jobs, currentSettings, jobPageCounts, discountRules);
                    return (
                      <div key={group.key} className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-all duration-200">
                        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleGroup(group.key)}>
                          <input
                            type="checkbox"
                            checked={group.jobs.every(j => selectedJobIds.has(j.id))}
                            onChange={(e) => toggleSelectGroup(group.jobs, e)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-[#E2E8F0] text-[#6366F1] focus:ring-[#6366F1]"
                          />
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366F1]/10 to-[#8B5CF6]/10 flex items-center justify-center text-sm font-bold text-[#6366F1] flex-shrink-0">
                            {group.customerName ? group.customerName.charAt(0).toUpperCase() : "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#0F172A] truncate">{group.customerName || (isRtl ? "بدون اسم" : "Unnamed")}</p>
                            <p className="text-xs text-[#64748B]">
                              {group.phoneNumber || "-"} · {formatRelativeTime(group.latestDate, lang)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-[#0F172A]">{formatPrice(total.finalTotal)}</p>
                          </div>
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#F1F5F9] text-[#64748B] text-xs font-medium">
                            {group.jobs.length}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleGroup(group.key); }}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${collapsedGroups.has(group.key) ? '-rotate-90' : ''}`}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                        </div>

                        {!collapsedGroups.has(group.key) && (
                          <div className="border-t border-[#E2E8F0]">
                            {group.jobs.map((job) => {
                              const pageCount = jobPageCounts[job.id] || job.pageCount || 1;
                              const priceCalc = calculatePrintPrice(job, currentSettings, pageCount);
                              const discountResult = calculateJobDiscount(job, priceCalc.totalPrice, pageCount, discountRules);
                              const finalPrice = priceCalc.totalPrice - discountResult.discountAmount;
                              return (
                                <div key={job.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8FAFC] transition-colors border-b border-[#E2E8F0] last:border-b-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedJobIds.has(job.id)}
                                    onChange={() => toggleSelectJob(job.id)}
                                    className="w-4 h-4 rounded border-[#E2E8F0] text-[#6366F1] focus:ring-[#6366F1] flex-shrink-0"
                                  />
                                  <span className="text-lg flex-shrink-0">{getFileTypeIcon(job.fileType)}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium text-[#0F172A] truncate">{job.fileName}</span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] font-medium uppercase flex-shrink-0">{getFileExtension(job.fileName)}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
                                      <span>{formatFileSize(job.fileSize || 0)}</span>
                                      <span>{pageCount} {isRtl ? "صفحة" : "pg"}</span>
                                    </div>
                                  </div>
                                  <div className="hidden lg:flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleToggleColorMode(job)}
                                      className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all duration-200 ${
                                        job.printPreferences?.colorMode === "color"
                                          ? "bg-[#EEF2FF] text-[#6366F1] border-[#6366F1]/20"
                                          : "bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]"
                                      }`}
                                    >
                                      {job.printPreferences?.colorMode === "color" ? (isRtl ? "ملون" : "Color") : (isRtl ? "أسود" : "B&W")}
                                    </button>
                                    <div className="relative">
                                      {editingCopiesJobId === job.id ? (
                                        <input
                                          type="number"
                                          min={1}
                                          max={100}
                                          value={editingCopiesValue}
                                          onChange={(e) => setEditingCopiesValue(Number(e.target.value))}
                                          onBlur={() => handleSaveCopies(job, editingCopiesValue)}
                                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveCopies(job, editingCopiesValue); if (e.key === "Escape") setEditingCopiesJobId(null); }}
                                          className="w-14 h-7 px-1.5 rounded-lg border border-[#6366F1] text-xs text-center font-medium focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                                          autoFocus
                                        />
                                      ) : (
                                        <button
                                          onClick={() => { setEditingCopiesJobId(job.id); setEditingCopiesValue(job.printPreferences?.copies || 1); }}
                                          className="px-2 py-1 rounded-lg text-xs font-medium bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] hover:bg-[#E2E8F0] transition-all duration-200"
                                        >
                                          {job.printPreferences?.copies || 1}x
                                        </button>
                                      )}
                                    </div>
                                    <select
                                      value={job.printPreferences?.paperType || "normal"}
                                      onChange={(e) => handlePaperTypeChange(job, e.target.value)}
                                      disabled={savingPrefsJobId === job.id}
                                      className="px-2 py-1 rounded-lg text-xs font-medium bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] focus:outline-none transition-all duration-200"
                                    >
                                      {paperTypes.map((pt) => (
                                        <option key={pt.id} value={pt.id}>{isRtl ? pt.nameAr : pt.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-[#0F172A]">{formatPrice(finalPrice)}</p>
                                    {discountResult.discountAmount > 0 && (
                                      <p className="text-[10px] text-[#22C55E] font-medium">-{formatPrice(discountResult.discountAmount)}</p>
                                    )}
                                  </div>
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeStyle(job.status)}`}>
                                    {job.status === PrintStatus.PRINTED ? (isRtl ? "مطبوع" : "Printed") : job.status === PrintStatus.READY ? (isRtl ? "جاهز" : "Ready") : (isRtl ? "قيد الانتظار" : "Pending")}
                                  </span>
                                  <button
                                    onClick={() => handlePaymentClick(job)}
                                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getPaymentBadgeStyle(job.paymentStatus)} hover:opacity-80 transition-opacity`}
                                  >
                                    {job.paymentStatus === PaymentStatus.PAID ? (isRtl ? "مدفوع" : "Paid") : job.paymentStatus === PaymentStatus.PARTIAL ? (isRtl ? "جزئي" : "Partial") : (isRtl ? "غير مدفوع" : "Unpaid")}
                                  </button>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => handlePrint(job)} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "طباعة" : "Print"}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                                    </button>
                                    <button onClick={() => handlePreview(job)} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "معاينة" : "Preview"}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                    </button>
                                    <button onClick={() => handleEdit(job)} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "تعديل" : "Edit"}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    </button>
                                    <button onClick={() => handleDownload(job)} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition-colors" title={isRtl ? "تحميل" : "Download"}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                                    </button>
                                    <select
                                      value={job.status}
                                      onChange={(e) => handleStatusChange(job.id, e.target.value as PrintStatus)}
                                      className="w-9 h-9 rounded-xl border border-[#E2E8F0] bg-white text-xs text-center text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 cursor-pointer appearance-none"
                                      title={isRtl ? "تغيير الحالة" : "Change status"}
                                    >
                                      <option value={PrintStatus.PENDING}>{isRtl ? "قيد الانتظار" : "Pending"}</option>
                                      <option value={PrintStatus.READY}>{isRtl ? "جاهز" : "Ready"}</option>
                                      <option value={PrintStatus.PRINTED}>{isRtl ? "مطبوع" : "Printed"}</option>
                                    </select>
                                    <button onClick={() => handleDelete(job.id)} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#EF4444] hover:bg-[#FEF2F2] transition-colors" title={isRtl ? "حذف" : "Delete"}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Gmail Tab */}
          {activeTab === "gmail" && (
            <div className="p-4 lg:p-6 space-y-6">
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                <h2 className="text-lg font-bold text-[#0F172A] mb-4">{isRtl ? "البريد الإلكتروني" : "Email"}</h2>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${gmailConnected ? 'bg-[#F0FDF4] text-[#22C55E]' : 'bg-[#FEF2F2] text-[#EF4444]'}`}>
                    <div className={`w-2 h-2 rounded-full ${gmailConnected ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`} />
                    {gmailConnected ? (isRtl ? "متصل" : "Connected") : (isRtl ? "غير متصل" : "Disconnected")}
                  </div>
                  {gmailConnected && <span className="text-sm text-[#64748B]">{gmailEmail}</span>}
                  <div className="flex-1" />
                  {!gmailConnected ? (
                    <button onClick={handleGmailConnect} className="px-4 py-2 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200">
                      {isRtl ? "الاتصال بـ Gmail" : "Connect Gmail"}
                    </button>
                  ) : (
                    <button onClick={handleGmailDisconnect} className="px-4 py-2 rounded-xl text-sm font-medium text-[#EF4444] border border-[#EF4444] hover:bg-[#FEF2F2] transition-all duration-200">
                      {isRtl ? "قطع الاتصال" : "Disconnect"}
                    </button>
                  )}
                </div>

                <div className="space-y-3 mb-6">
                  <h3 className="text-sm font-semibold text-[#0F172A]">{isRtl ? "إعدادات Gmail" : "Gmail Settings"}</h3>
                  <input type="text" value={gmailClientId} onChange={(e) => setGmailClientId(e.target.value)} placeholder="Client ID" className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]" />
                  <input type="text" value={gmailClientSecret} onChange={(e) => setGmailClientSecret(e.target.value)} placeholder="Client Secret" className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]" />
                  <button onClick={handleSaveGmailSettings} className="px-4 py-2 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200">
                    {isRtl ? "حفظ الإعدادات" : "Save Settings"}
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={handleGmailPoll}
                    disabled={gmailPolling || gmailIsPolling}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] disabled:opacity-50 transition-all duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={gmailPolling ? 'animate-spin' : ''}>
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                    </svg>
                    {gmailPolling ? (isRtl ? "جارٍ السحب..." : "Polling...") : (isRtl ? "سحب البريد" : "Poll Email")}
                  </button>
                </div>

                {gmailPending.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-[#0F172A]">
                        {isRtl ? "البريد الوارد" : "Pending Emails"} ({gmailPending.length})
                      </h3>
                      <div className="flex items-center gap-2">
                        <input type="text" value={gmailFilterText} onChange={(e) => setGmailFilterText(e.target.value)} placeholder={isRtl ? "بحث..." : "Search..."} className="h-8 px-3 rounded-lg border border-[#E2E8F0] text-xs focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20" />
                        <select value={gmailFilterDate} onChange={(e) => setGmailFilterDate(e.target.value as any)} className="h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs focus:outline-none">
                          <option value="all">{isRtl ? "الكل" : "All"}</option>
                          <option value="today">{isRtl ? "اليوم" : "Today"}</option>
                          <option value="week">{isRtl ? "هذا الأسبوع" : "This Week"}</option>
                        </select>
                        <select value={gmailFilterType} onChange={(e) => setGmailFilterType(e.target.value as any)} className="h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs focus:outline-none">
                          <option value="all">{isRtl ? "الكل" : "All"}</option>
                          <option value="pdf">PDF</option>
                          <option value="images">{isRtl ? "صور" : "Images"}</option>
                          <option value="other">{isRtl ? "أخرى" : "Other"}</option>
                        </select>
                      </div>
                    </div>
                    {gmailFilteredPending.length === 0 ? (
                      <p className="text-sm text-[#64748B] text-center py-8">{isRtl ? "لا توجد رسائل" : "No emails found"}</p>
                    ) : (
                      <div className="space-y-2">
                        {gmailFilteredPending.map((email: any) => (
                          <div key={email.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#F8FAFC] transition-colors">
                            <input type="checkbox" checked={gmailSelectedIds.has(email.id)} onChange={() => toggleGmailSelection(email.id)} className="w-4 h-4 rounded border-[#E2E8F0] text-[#6366F1] focus:ring-[#6366F1]" />
                            <span className="text-lg">📧</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#0F172A] truncate">{email.subject || (isRtl ? "بدون موضوع" : "No Subject")}</p>
                              <p className="text-xs text-[#64748B]">{email.email_from || email.email_address} · {email.attachment_meta?.length || 0} {isRtl ? "مرفقات" : "attachments"}</p>
                            </div>
                            <span className="text-xs text-[#94A3B8]">{formatRelativeTime(email.fetched_at || email.received_at, lang)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {gmailSelectedIds.size > 0 && (
                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#E2E8F0]">
                        <button onClick={handleGmailImportSelected} disabled={gmailImporting} className="px-4 py-2 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] disabled:opacity-50 transition-all duration-200">
                          {gmailImporting ? (isRtl ? "جارٍ الاستيراد..." : "Importing...") : (isRtl ? "استيراد المحدد" : `Import Selected (${gmailSelectedIds.size})`)}
                        </button>
                        <button onClick={handleGmailDiscardSelected} className="px-4 py-2 rounded-xl text-sm font-medium text-[#EF4444] border border-[#EF4444] hover:bg-[#FEF2F2] transition-all duration-200">
                          {isRtl ? "تجاهل" : "Discard"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-[#E2E8F0]">
                  <h3 className="text-sm font-semibold text-[#0F172A] mb-2">{isRtl ? "قالب الرد" : "Reply Template"}</h3>
                  <textarea
                    value={gmailReplyTemplate}
                    onChange={(e) => setGmailReplyTemplate(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]"
                    placeholder={isRtl ? "أدخل قالب الرد..." : "Enter reply template..."}
                  />
                  <button onClick={handleSaveReplyTemplate} className="mt-2 px-4 py-2 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200">
                    {isRtl ? "حفظ القالب" : "Save Template"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="p-4 lg:p-6 space-y-6">
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                <h2 className="text-lg font-bold text-[#0F172A] mb-4">{isRtl ? "إعدادات المتجر" : "Shop Settings"}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "اسم المتجر" : "Shop Name"}</label>
                    <input type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "شعار المتجر" : "Shop Logo"}</label>
                    <div className="flex items-center gap-4">
                      {logoUrl && <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover" />}
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-sm text-[#64748B] file:mr-3 file:px-3 file:py-1.5 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[#6366F1] file:text-white hover:file:bg-[#4F46E5]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-[#0F172A]">{isRtl ? "أنواع الورق" : "Paper Types"}</label>
                      <button onClick={() => setShowAddPaperTypeForm(true)} className="text-xs text-[#6366F1] hover:text-[#4F46E5] font-medium">+ {isRtl ? "إضافة" : "Add"}</button>
                    </div>
                    <div className="space-y-2">
                      {paperTypes.map((pt) => (
                        <div key={pt.id} className="flex items-center gap-2 p-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                          {editingPaperTypeId === pt.id && editingPaperTypeForm ? (
                            <>
                              <input value={editingPaperTypeForm.name} onChange={(e) => setEditingPaperTypeForm({...editingPaperTypeForm, name: e.target.value})} className="flex-1 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" placeholder="Name" />
                              <input value={editingPaperTypeForm.nameAr} onChange={(e) => setEditingPaperTypeForm({...editingPaperTypeForm, nameAr: e.target.value})} className="flex-1 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" placeholder="الاسم" />
                              <input type="number" value={editingPaperTypeForm.colorPerPage} onChange={(e) => setEditingPaperTypeForm({...editingPaperTypeForm, colorPerPage: Number(e.target.value)})} className="w-20 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" />
                              <input type="number" value={editingPaperTypeForm.blackWhitePerPage} onChange={(e) => setEditingPaperTypeForm({...editingPaperTypeForm, blackWhitePerPage: Number(e.target.value)})} className="w-20 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" />
                              <button onClick={() => handleSavePaperType(pt.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#22C55E] hover:bg-[#F0FDF4]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20 6 9 17 4 12" /></svg></button>
                              <button onClick={() => { setEditingPaperTypeId(null); setEditingPaperTypeForm(null); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#EF4444] hover:bg-[#FEF2F2]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-[#0F172A]">{isRtl ? pt.nameAr : pt.name}</span>
                              <span className="text-xs text-[#64748B]">{isRtl ? "ملون" : "Color"}: {pt.colorPerPage}</span>
                              <span className="text-xs text-[#64748B]">B&W: {pt.blackWhitePerPage}</span>
                              <button onClick={() => { setEditingPaperTypeId(pt.id); setEditingPaperTypeForm({ name: pt.name, nameAr: pt.nameAr, colorPerPage: pt.colorPerPage, blackWhitePerPage: pt.blackWhitePerPage }); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6366F1] hover:bg-[#EEF2FF]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                              <button onClick={() => handleDeletePaperType(pt.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#EF4444] hover:bg-[#FEF2F2]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
                            </>
                          )}
                        </div>
                      ))}
                      {showAddPaperTypeForm && (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                          <input value={newPaperTypeForm.name} onChange={(e) => setNewPaperTypeForm({...newPaperTypeForm, name: e.target.value})} className="flex-1 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" placeholder={isRtl ? "الاسم (إنجليزي)" : "Name (English)"} />
                          <input value={newPaperTypeForm.nameAr} onChange={(e) => setNewPaperTypeForm({...newPaperTypeForm, nameAr: e.target.value})} className="flex-1 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" placeholder={isRtl ? "الاسم (عربي)" : "Name (Arabic)"} />
                          <input type="number" value={newPaperTypeForm.colorPerPage} onChange={(e) => setNewPaperTypeForm({...newPaperTypeForm, colorPerPage: Number(e.target.value)})} className="w-20 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" placeholder="Color" />
                          <input type="number" value={newPaperTypeForm.blackWhitePerPage} onChange={(e) => setNewPaperTypeForm({...newPaperTypeForm, blackWhitePerPage: Number(e.target.value)})} className="w-20 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs" placeholder="B&W" />
                          <button onClick={handleAddPaperType} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#22C55E] hover:bg-[#F0FDF4]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg></button>
                          <button onClick={() => setShowAddPaperTypeForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#EF4444] hover:bg-[#FEF2F2]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={saveSettings} className="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200">
                    {isRtl ? "حفظ الإعدادات" : "Save Settings"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                <h2 className="text-lg font-bold text-[#0F172A] mb-4">{isRtl ? "تغيير كلمة المرور" : "Change Password"}</h2>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div className="relative">
                    <input type={showPasswords.current ? "text" : "password"} value={passwordForm.current} onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})} placeholder={isRtl ? "كلمة المرور الحالية" : "Current Password"} className="w-full h-10 px-3 pr-10 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]" />
                    <button type="button" onClick={() => setShowPasswords({...showPasswords, current: !showPasswords.current})} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                  </div>
                  <div className="relative">
                    <input type={showPasswords.newPass ? "text" : "password"} value={passwordForm.newPass} onChange={(e) => setPasswordForm({...passwordForm, newPass: e.target.value})} placeholder={isRtl ? "كلمة المرور الجديدة" : "New Password"} className="w-full h-10 px-3 pr-10 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]" />
                    <button type="button" onClick={() => setShowPasswords({...showPasswords, newPass: !showPasswords.newPass})} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                  </div>
                  <div className="relative">
                    <input type={showPasswords.confirm ? "text" : "password"} value={passwordForm.confirm} onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})} placeholder={isRtl ? "تأكيد كلمة المرور الجديدة" : "Confirm New Password"} className="w-full h-10 px-3 pr-10 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]" />
                    <button type="button" onClick={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                  </div>
                  {passwordError && <p className="text-xs text-[#EF4444]">{passwordError}</p>}
                  {passwordSuccess && <p className="text-xs text-[#22C55E]">{isRtl ? "تم تغيير كلمة المرور بنجاح" : "Password changed successfully"}</p>}
                  <button type="submit" className="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200">
                    {isRtl ? "تغيير كلمة المرور" : "Change Password"}
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                <h2 className="text-lg font-bold text-[#0F172A] mb-4">{isRtl ? "النسخ الاحتياطي" : "Backup & Restore"}</h2>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleBackupDownload} className="px-4 py-2 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200">
                    {isRtl ? "تحميل نسخة احتياطية" : "Download Backup"}
                  </button>
                  <button onClick={() => setBackupRestoreOpen(true)} className="px-4 py-2 rounded-xl text-sm font-medium border border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9] transition-all duration-200">
                    {isRtl ? "استعادة" : "Restore"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#0F172A]">{isRtl ? "قواعد الخصم" : "Discount Rules"}</h2>
                  <button onClick={handleAddRule} className="px-3 py-1.5 rounded-xl text-sm font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-all duration-200">+ {isRtl ? "إضافة قاعدة" : "Add Rule"}</button>
                </div>
                {discountRules.length === 0 ? (
                  <p className="text-sm text-[#64748B] text-center py-6">{isRtl ? "لا توجد قواعد خصم" : "No discount rules"}</p>
                ) : (
                  <div className="space-y-2">
                    {discountRules.map((rule) => (
                      <div key={rule.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#0F172A]">{rule.name}</p>
                          <p className="text-xs text-[#64748B]">{rule.discount_type === "percent" ? `${rule.discount_value}%` : formatPrice(rule.discount_value)} {isRtl ? "خصم عند" : "off when"} {rule.condition_type} &ge; {rule.threshold}</p>
                        </div>
                        <button onClick={() => handleToggleRuleActive(rule)} className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${rule.is_active ? 'bg-[#22C55E]' : 'bg-[#E2E8F0]'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${rule.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                        <button onClick={() => handleEditRule(rule)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#EF4444] hover:bg-[#FEF2F2]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRtl ? "تأكيد الحذف" : "Confirm Delete"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isRtl ? `هل أنت متأكد من حذف ${selectedJobIds.size} ملف؟` : `Are you sure you want to delete ${selectedJobIds.size} files?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isRtl ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-[#EF4444] hover:bg-[#DC2626]">{isRtl ? "حذف" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Confirm */}
      <AlertDialog open={!!singleDeleteConfirm} onOpenChange={(o) => !o && setSingleDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRtl ? "تأكيد الحذف" : "Confirm Delete"}</AlertDialogTitle>
            <AlertDialogDescription>{isRtl ? "هل أنت متأكد من حذف هذا الملف؟" : "Are you sure you want to delete this file?"}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isRtl ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSingleDelete} className="bg-[#EF4444] hover:bg-[#DC2626]">{isRtl ? "حذف" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Edit Dialog */}
      <Dialog open={!!paymentEditJob} onOpenChange={(o) => !o && setPaymentEditJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRtl ? "تعديل حالة الدفع" : "Edit Payment Status"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "الحالة" : "Status"}</label>
              <select value={paymentEditStatus} onChange={(e) => setPaymentEditStatus(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20">
                <option value={PaymentStatus.UNPAID}>{isRtl ? "غير مدفوع" : "Unpaid"}</option>
                <option value={PaymentStatus.PARTIAL}>{isRtl ? "مدفوع جزئياً" : "Partial"}</option>
                <option value={PaymentStatus.PAID}>{isRtl ? "مدفوع" : "Paid"}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "المبلغ" : "Amount"}</label>
              <input type="number" step="0.01" value={paymentEditAmount} onChange={(e) => setPaymentEditAmount(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentEditJob(null)}>{isRtl ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSavePayment}>{isRtl ? "حفظ" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gmail Disconnect Confirm */}
      <AlertDialog open={gmailDisconnectConfirm} onOpenChange={setGmailDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRtl ? "قطع اتصال Gmail" : "Disconnect Gmail"}</AlertDialogTitle>
            <AlertDialogDescription>{isRtl ? "هل أنت متأكد من قطع الاتصال بـ Gmail؟" : "Are you sure you want to disconnect Gmail?"}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isRtl ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmGmailDisconnect} className="bg-[#EF4444] hover:bg-[#DC2626]">{isRtl ? "قطع الاتصال" : "Disconnect"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discount Rule Form Dialog */}
      <Dialog open={showRuleForm} onOpenChange={(o) => !o && setShowRuleForm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditingRule ? (isRtl ? "تعديل قاعدة الخصم" : "Edit Discount Rule") : (isRtl ? "إضافة قاعدة خصم" : "Add Discount Rule")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "الاسم" : "Name"}</label>
              <Input value={ruleFormData.name || ""} onChange={(e) => setRuleFormData({...ruleFormData, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "النوع" : "Type"}</label>
                <Select value={ruleFormData.discount_type} onValueChange={(v) => setRuleFormData({...ruleFormData, discount_type: v as DiscountType})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">%</SelectItem>
                    <SelectItem value="fixed">{isRtl ? "ثابت" : "Fixed"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "القيمة" : "Value"}</label>
                <Input type="number" value={ruleFormData.discount_value || ""} onChange={(e) => setRuleFormData({...ruleFormData, discount_value: Number(e.target.value)})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "الشرط" : "Condition"}</label>
                <Select value={ruleFormData.condition_type} onValueChange={(v) => setRuleFormData({...ruleFormData, condition_type: v as ConditionType})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pages">{isRtl ? "صفحات" : "Pages"}</SelectItem>
                    <SelectItem value="copies">{isRtl ? "نسخ" : "Copies"}</SelectItem>
                    <SelectItem value="total">{isRtl ? "إجمالي" : "Total"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "الحد الأدنى" : "Threshold"}</label>
                <Input type="number" value={ruleFormData.threshold || ""} onChange={(e) => setRuleFormData({...ruleFormData, threshold: Number(e.target.value)})} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "الحد الأقصى للخصم" : "Max Discount Cap"} ({isRtl ? "اختياري" : "optional"})</label>
              <Input type="number" value={ruleFormData.max_discount_cap || ""} onChange={(e) => setRuleFormData({...ruleFormData, max_discount_cap: e.target.value ? Number(e.target.value) : null})} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#0F172A] mb-1 block">{isRtl ? "الأولوية" : "Priority"}</label>
              <Input type="number" value={ruleFormData.priority || 0} onChange={(e) => setRuleFormData({...ruleFormData, priority: Number(e.target.value)})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleForm(false)}>{isRtl ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSaveRule}>{isRtl ? "حفظ" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirm */}
      <AlertDialog open={!!deleteRuleConfirm} onOpenChange={(o) => !o && setDeleteRuleConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRtl ? "تأكيد حذف القاعدة" : "Confirm Delete Rule"}</AlertDialogTitle>
            <AlertDialogDescription>{isRtl ? "هل أنت متأكد من حذف قاعدة الخصم هذه؟" : "Are you sure you want to delete this discount rule?"}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isRtl ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRule} className="bg-[#EF4444] hover:bg-[#DC2626]">{isRtl ? "حذف" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Backup Restore Dialog */}
      <Dialog open={backupRestoreOpen} onOpenChange={(o) => !o && setBackupRestoreOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRtl ? "استعادة النسخة الاحتياطية" : "Restore Backup"}</DialogTitle>
            <DialogDescription>{isRtl ? "سيتم استبدال جميع البيانات الحالية. لا يمكن التراجع عن هذا الإجراء." : "This will replace all current data. This action cannot be undone."}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input type="file" accept=".json" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} className="text-sm text-[#64748B] file:mr-3 file:px-3 file:py-1.5 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[#6366F1] file:text-white hover:file:bg-[#4F46E5]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupRestoreOpen(false)} disabled={restoring}>{isRtl ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleBackupRestore} disabled={!restoreFile || restoring}>{restoring ? (isRtl ? "جارٍ الاستعادة..." : "Restoring...") : (isRtl ? "استعادة" : "Restore")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gmail Review Dialog */}
      <Dialog open={gmailReviewOpen} onOpenChange={(o) => !o && setGmailReviewOpen(false)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRtl ? "مراجعة الاستيراد" : "Review Import"}</DialogTitle>
            <DialogDescription>{isRtl ? "قم بمراجعة إعدادات الاستيراد لكل مرفق" : "Review import settings for each attachment"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {gmailSelectedEmails.map((email: any) => (
              <div key={email.id}>
                <p className="text-sm font-medium text-[#0F172A] mb-2">{email.subject}</p>
                {(email.attachment_meta || []).map((att: any, idx: number) => {
                  const key = `${email.id}_${idx}`;
                  const override = gmailReviewOverrides[key] || { copies: 1, colorMode: 'color', paperType: 'normal' };
                  return (
                    <div key={key} className="flex items-center gap-3 p-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] mb-2">
                      <span className="text-lg">{getFileTypeIcon(att.mimeType || '')}</span>
                      <span className="flex-1 text-sm text-[#0F172A] truncate">{att.filename || att.name || 'file'}</span>
                      <input type="number" min={1} value={override.copies} onChange={(e) => updateGmailOverride(key, 'copies', Number(e.target.value))} className="w-14 h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs text-center" />
                      <select value={override.colorMode} onChange={(e) => updateGmailOverride(key, 'colorMode', e.target.value)} className="h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs">
                        <option value="color">{isRtl ? "ملون" : "Color"}</option>
                        <option value="blackWhite">{isRtl ? "أسود" : "B&W"}</option>
                      </select>
                      <select value={override.paperType} onChange={(e) => updateGmailOverride(key, 'paperType', e.target.value)} className="h-8 px-2 rounded-lg border border-[#E2E8F0] text-xs">
                        {paperTypes.map((pt) => (<option key={pt.id} value={pt.id}>{isRtl ? pt.nameAr : pt.name}</option>))}
                      </select>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGmailReviewOpen(false)}>{isRtl ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleGmailConfirmImport}>{isRtl ? "تأكيد الاستيراد" : "Confirm Import"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      {previewJob && previewUrl && (
        <PreviewModal
          open={true}
          url={previewUrl}
          fileName={previewJob.fileName}
          fileType={previewJob.fileType}
          fileSize={previewJob.fileSize}
          onClose={() => { setPreviewJob(null); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
};

export default AdminView;
