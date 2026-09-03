import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';

const DEFAULT_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api';
const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
const COLORS = {
  ink: '#1E2A24',
  muted: '#68746D',
  line: '#E1E7E1',
  paper: '#F7F8F5',
  white: '#FFFFFF',
  green: '#2D6A4F',
  paleGreen: '#E4F2EC',
  coral: '#C9674E'
};

function formatMoney(cents) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatSlot(iso) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function initials(name) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2);
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  } catch (_networkError) {
    const error = new Error('The API could not be reached.');
    error.code = 'OFFLINE';
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || 'The service is unavailable.');
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const [experts, setExperts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [availableToday, setAvailableToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [slow, setSlow] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState(null);
  const [bookingError, setBookingError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', notes: '' });
  const slowTimer = useRef(null);

  const loadExperts = useCallback(async (isRefresh = false) => {
    setError(null);
    setSlow(false);
    isRefresh ? setRefreshing(true) : setLoading(true);
    slowTimer.current = setTimeout(() => setSlow(true), 3500);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category !== 'All') params.set('category', category);
      if (availableToday) params.set('available', 'today');
      const result = await api(`/experts?${params.toString()}`);
      setExperts(result.experts);
    } catch (requestError) {
      setError(requestError);
    } finally {
      clearTimeout(slowTimer.current);
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [availableToday, category, query]);

  useEffect(() => {
    api('/categories').then((result) => setCategories(['All', ...result.categories])).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadExperts(), 280);
    return () => clearTimeout(timer);
  }, [loadExperts]);

  const openExpert = async (expert) => {
    setSelectedExpert(expert);
    setSelectedSlot(null);
    setSlots([]);
    setSlotsLoading(true);
    try {
      const result = await api(`/experts/${expert.id}/slots`);
      setSlots(result.slots.filter((slot) => !slot.isBooked));
    } catch (requestError) {
      setBookingError(requestError.message);
    } finally {
      setSlotsLoading(false);
    }
  };

  const submitBooking = async () => {
    if (!selectedExpert || !selectedSlot || !form.name.trim() || !form.email.trim()) {
      setBookingError('Please add your name, email, and a time.');
      return;
    }
    setSaving(true);
    setBookingError('');
    try {
      const result = await api('/bookings', {
        method: 'POST',
        headers: {
          'Idempotency-Key': `mobile-${selectedSlot.id}-${form.email.trim().toLowerCase().replace(/[^\w:./-]/g, '_')}`
        },
        body: JSON.stringify({ expertId: selectedExpert.id, slotId: selectedSlot.id, ...form })
      });
      setBooking(result.booking);
      setBookingOpen(false);
      setSelectedExpert(null);
      setSelectedSlot(null);
    } catch (requestError) {
      setBookingError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const clearSelection = () => {
    setSelectedExpert(null);
    setSelectedSlot(null);
    setBookingError('');
  };

  const subtitle = useMemo(() => {
    if (loading) return 'Finding the right people for you…';
    return `${experts.length} expert${experts.length === 1 ? '' : 's'} ready to help`;
  }, [experts.length, loading]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadExperts(true)} tintColor={COLORS.green} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>BEE CONSULT</Text>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>Make your next move{'\n'}with clarity.</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View accessible accessibilityLabel="BEE Consult logo" style={styles.logo}><Text style={styles.logoText}>B</Text></View>
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search experts"
            placeholder="Search by name, topic, or skill"
            placeholderTextColor="#96A19A"
            value={query}
            onChangeText={setQuery}
            style={styles.search}
            returnKeyType="search"
          />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')}><Text style={styles.clear}>×</Text></Pressable> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {categories.map((item) => (
            <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipSelected]}>
              <Text style={[styles.chipText, category === item && styles.chipTextSelected]}>{item}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityState={{ checked: availableToday }} onPress={() => setAvailableToday((value) => !value)} style={[styles.chip, availableToday && styles.chipSelected]}>
            <Text style={[styles.chipText, availableToday && styles.chipTextSelected]}>Available today</Text>
          </Pressable>
        </ScrollView>

        {slow && loading ? <View style={styles.notice}><Text style={styles.noticeText}>Still looking — the connection is taking a moment.</Text></View> : null}
        {error && !loading ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateIcon}>↯</Text>
            <Text style={styles.stateTitle}>{error.code === 'OFFLINE' ? 'You seem to be offline' : 'We hit a small snag'}</Text>
            <Text style={styles.stateBody}>{error.message} Check your connection and try again.</Text>
            <Pressable accessibilityRole="button" onPress={() => loadExperts()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Try again</Text></Pressable>
          </View>
        ) : loading ? (
          <View>{[1, 2, 3].map((item) => <View key={item} style={styles.skeleton}><View style={styles.skeletonAvatar} /><View style={styles.skeletonLines}><View style={styles.skeletonLine} /><View style={[styles.skeletonLine, { width: '65%' }]} /></View></View>)}</View>
        ) : experts.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateIcon}>✦</Text>
            <Text style={styles.stateTitle}>No experts found</Text>
            <Text style={styles.stateBody}>Try a different search or clear your filters to explore everyone.</Text>
            <Pressable accessibilityRole="button" onPress={() => { setQuery(''); setCategory('All'); setAvailableToday(false); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Clear filters</Text></Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {experts.map((expert) => (
              <Pressable key={expert.id} accessibilityRole="button" accessibilityLabel={`Book a session with ${expert.name}`} onPress={() => openExpert(expert)} style={styles.expertCard}>
                <View style={[styles.avatar, { backgroundColor: expert.accent }]}><Text style={styles.avatarText}>{expert.initials || initials(expert.name)}</Text></View>
                <View style={styles.expertContent}>
                  <View style={styles.cardTop}><Text style={styles.expertName}>{expert.name}</Text><Text style={styles.rating}>★ {expert.rating}</Text></View>
                  <Text style={styles.expertTitle}>{expert.title}</Text>
                  <Text numberOfLines={2} style={styles.bio}>{expert.bio}</Text>
                  <View style={styles.cardBottom}><Text style={styles.next}>Next: {expert.nextAvailableAt ? formatSlot(expert.nextAvailableAt) : 'Soon'}</Text><Text style={styles.price}>{formatMoney(expert.priceCents)} <Text style={styles.per}>/ session</Text></Text></View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={Boolean(selectedExpert)} animationType="slide" onRequestClose={clearSelection}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalPage} keyboardShouldPersistTaps="handled">
            <Pressable accessibilityRole="button" accessibilityLabel="Close expert details" onPress={clearSelection} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
            {selectedExpert ? <>
              <View style={[styles.detailAvatar, { backgroundColor: selectedExpert.accent }]}><Text style={styles.detailAvatarText}>{selectedExpert.initials}</Text></View>
              <Text style={styles.detailName}>{selectedExpert.name}</Text>
              <Text style={styles.detailTitle}>{selectedExpert.title}</Text>
              <Text style={styles.detailBio}>{selectedExpert.bio}</Text>
              <Text style={styles.sectionLabel}>Choose a time</Text>
              {slotsLoading ? <ActivityIndicator color={COLORS.green} style={styles.loader} /> : slots.length ? <View style={styles.slotGrid}>{slots.map((slot) => <Pressable key={slot.id} accessibilityRole="button" accessibilityState={{ selected: selectedSlot?.id === slot.id }} onPress={() => setSelectedSlot(slot)} style={[styles.slot, selectedSlot?.id === slot.id && styles.slotSelected]}><Text style={[styles.slotText, selectedSlot?.id === slot.id && styles.slotTextSelected]}>{formatSlot(slot.startsAt)}</Text></Pressable>)}</View> : <Text style={styles.emptySlots}>No future times are available right now.</Text>}
              {bookingError ? <Text accessibilityRole="alert" style={styles.formError}>{bookingError}</Text> : null}
              <Pressable accessibilityRole="button" disabled={!selectedSlot || slotsLoading} onPress={() => { setBookingError(''); setBookingOpen(true); }} style={[styles.primaryButton, (!selectedSlot || slotsLoading) && styles.disabled]}><Text style={styles.primaryButtonText}>Continue to booking</Text></Pressable>
            </> : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={bookingOpen} animationType="fade" transparent onRequestClose={() => setBookingOpen(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>A few details</Text>
            <Text style={styles.formSubtitle}>{selectedExpert?.name} · {selectedSlot ? formatSlot(selectedSlot.startsAt) : ''}</Text>
            <TextInput accessibilityLabel="Your name" placeholder="Your name" placeholderTextColor="#96A19A" value={form.name} onChangeText={(name) => setForm({ ...form, name })} style={styles.input} />
            <TextInput accessibilityLabel="Email address" placeholder="Email address" placeholderTextColor="#96A19A" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(email) => setForm({ ...form, email })} style={styles.input} />
            <TextInput accessibilityLabel="What would you like to discuss" placeholder="What would you like to discuss? (optional)" placeholderTextColor="#96A19A" multiline value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} style={[styles.input, styles.notes]} />
            {bookingError ? <Text accessibilityRole="alert" style={styles.formError}>{bookingError}</Text> : null}
            <Pressable accessibilityRole="button" disabled={saving} onPress={submitBooking} style={[styles.primaryButton, saving && styles.disabled]}><Text style={styles.primaryButtonText}>{saving ? 'Confirming…' : `Confirm · ${selectedExpert ? formatMoney(selectedExpert.priceCents) : ''}`}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setBookingOpen(false)} style={styles.cancel}><Text style={styles.cancelText}>Not yet</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(booking)} animationType="slide" onRequestClose={() => { setBooking(null); clearSelection(); }}>
        <SafeAreaView style={styles.confirmSafe}><View style={styles.confirmPage}><View style={styles.check}><Text style={styles.checkText}>✓</Text></View><Text style={styles.confirmTitle}>You're all set.</Text><Text style={styles.confirmBody}>Your session with {booking?.expertName} is confirmed for {booking ? formatSlot(booking.startsAt) : ''}.</Text><View style={styles.summary}><Text style={styles.summaryLabel}>Confirmation</Text><Text style={styles.summaryValue}>{booking?.id}</Text><Text style={styles.summaryLabel}>Paid at session rate</Text><Text style={styles.summaryValue}>{booking ? formatMoney(booking.priceCents) : ''}</Text></View><Pressable accessibilityRole="button" onPress={() => { setBooking(null); clearSelection(); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Back to experts</Text></Pressable></View></SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  page: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 44 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { color: COLORS.green, fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 10 },
  title: { color: COLORS.ink, fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  titleCompact: { fontSize: 28, lineHeight: 32 },
  subtitle: { color: COLORS.muted, fontSize: 15, marginTop: 10 },
  logo: { alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
  logoText: { color: COLORS.white, fontSize: 25, fontWeight: '800' },
  searchWrap: { alignItems: 'center', backgroundColor: COLORS.white, borderColor: COLORS.line, borderRadius: 14, borderWidth: 1, flexDirection: 'row', height: 54, paddingHorizontal: 15 },
  searchIcon: { color: COLORS.green, fontSize: 27, marginRight: 8, marginTop: -5 },
  search: { color: COLORS.ink, flex: 1, fontSize: 15 },
  clear: { color: COLORS.muted, fontSize: 25, paddingLeft: 8 },
  filters: { gap: 8, paddingBottom: 22, paddingTop: 14 },
  chip: { backgroundColor: COLORS.white, borderColor: COLORS.line, borderRadius: 20, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 9 },
  chipSelected: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  chipText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: COLORS.white },
  notice: { backgroundColor: '#FFF7E6', borderRadius: 12, marginBottom: 12, padding: 12 },
  noticeText: { color: '#795C20', fontSize: 13 },
  list: { gap: 12 },
  expertCard: { backgroundColor: COLORS.white, borderColor: COLORS.line, borderRadius: 18, borderWidth: 1, flexDirection: 'row', padding: 15 },
  avatar: { alignItems: 'center', borderRadius: 19, height: 48, justifyContent: 'center', marginRight: 12, width: 48 },
  avatarText: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  expertContent: { flex: 1 },
  cardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  expertName: { color: COLORS.ink, flex: 1, fontSize: 17, fontWeight: '800' },
  rating: { color: '#9B671D', fontSize: 12, fontWeight: '800' },
  expertTitle: { color: COLORS.green, fontSize: 13, fontWeight: '700', marginTop: 3 },
  bio: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  cardBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  next: { color: COLORS.green, flex: 1, fontSize: 12, fontWeight: '700' },
  price: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  per: { color: COLORS.muted, fontSize: 11, fontWeight: '500' },
  stateCard: { alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 18, padding: 28 },
  stateIcon: { color: COLORS.green, fontSize: 30, marginBottom: 8 },
  stateTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '800' },
  stateBody: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginBottom: 18, marginTop: 8, textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 13, justifyContent: 'center', minHeight: 50, paddingHorizontal: 20, paddingVertical: 13 },
  primaryButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  secondaryButton: { borderColor: COLORS.green, borderRadius: 13, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  secondaryButtonText: { color: COLORS.green, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  skeleton: { backgroundColor: COLORS.white, borderRadius: 18, flexDirection: 'row', marginBottom: 12, padding: 15 },
  skeletonAvatar: { backgroundColor: '#E8ECE8', borderRadius: 19, height: 48, width: 48 },
  skeletonLines: { flex: 1, gap: 10, paddingLeft: 12, paddingTop: 5 },
  skeletonLine: { backgroundColor: '#E8ECE8', borderRadius: 5, height: 12, width: '85%' },
  modalSafe: { backgroundColor: COLORS.paper, flex: 1 },
  modalPage: { padding: 22, paddingBottom: 42 },
  close: { alignSelf: 'flex-end', backgroundColor: COLORS.white, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  closeText: { color: COLORS.ink, fontSize: 27, lineHeight: 30, textAlign: 'center' },
  detailAvatar: { alignItems: 'center', alignSelf: 'center', borderRadius: 46, height: 92, justifyContent: 'center', marginTop: 12, width: 92 },
  detailAvatarText: { color: COLORS.ink, fontSize: 27, fontWeight: '800' },
  detailName: { color: COLORS.ink, fontSize: 27, fontWeight: '800', marginTop: 17, textAlign: 'center' },
  detailTitle: { color: COLORS.green, fontSize: 15, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  detailBio: { color: COLORS.muted, fontSize: 15, lineHeight: 23, marginTop: 17, textAlign: 'center' },
  sectionLabel: { color: COLORS.ink, fontSize: 17, fontWeight: '800', marginBottom: 12, marginTop: 28 },
  loader: { marginVertical: 24 },
  slotGrid: { gap: 9 },
  slot: { backgroundColor: COLORS.white, borderColor: COLORS.line, borderRadius: 12, borderWidth: 1, padding: 14 },
  slotSelected: { backgroundColor: COLORS.paleGreen, borderColor: COLORS.green },
  slotText: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  slotTextSelected: { color: COLORS.green },
  emptySlots: { color: COLORS.muted, fontSize: 14, marginBottom: 20 },
  formError: { color: COLORS.coral, fontSize: 13, lineHeight: 19, marginBottom: 10, marginTop: 10 },
  overlay: { backgroundColor: 'rgba(30,42,36,0.45)', flex: 1, justifyContent: 'flex-end' },
  formCard: { backgroundColor: COLORS.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22 },
  formTitle: { color: COLORS.ink, fontSize: 24, fontWeight: '800' },
  formSubtitle: { color: COLORS.muted, fontSize: 14, marginBottom: 17, marginTop: 5 },
  input: { backgroundColor: COLORS.white, borderColor: COLORS.line, borderRadius: 12, borderWidth: 1, color: COLORS.ink, fontSize: 15, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 13 },
  notes: { minHeight: 75, textAlignVertical: 'top' },
  cancel: { alignItems: 'center', padding: 15 },
  cancelText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  confirmSafe: { backgroundColor: COLORS.paper, flex: 1 },
  confirmPage: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  check: { alignItems: 'center', backgroundColor: COLORS.paleGreen, borderRadius: 40, height: 80, justifyContent: 'center', width: 80 },
  checkText: { color: COLORS.green, fontSize: 42, fontWeight: '700' },
  confirmTitle: { color: COLORS.ink, fontSize: 31, fontWeight: '800', marginTop: 22 },
  confirmBody: { color: COLORS.muted, fontSize: 16, lineHeight: 24, marginTop: 10, textAlign: 'center' },
  summary: { alignSelf: 'stretch', backgroundColor: COLORS.white, borderRadius: 16, marginBottom: 24, marginTop: 25, padding: 18 },
  summaryLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  summaryValue: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginTop: 3 }
});
