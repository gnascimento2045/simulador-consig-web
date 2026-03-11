import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Calculator, TrendingUp, TrendingDown, Copy, Settings } from 'lucide-react';
import html2canvas from 'html2canvas';

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

const formatarMoeda = (valor) => {
  if (valor === null || valor === undefined || isNaN(valor)) {
    return '0,00';
  }
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function App() {
  const [nomeCliente, setNomeCliente] = useState('');
  const [parcela, setParcela] = useState('');
  const [prazo, setPrazo] = useState('96');
  const [margemDisponivel, setMargemDisponivel] = useState('');
  const [valorDesejado, setValorDesejado] = useState('');
  const [textoContratos, setTextoContratos] = useState('');
  const [bancos, setBancos] = useState([]);
  const [bancoSelecionado, setBancoSelecionado] = useState('');
  const [contratosLiberam, setContratosLiberam] = useState([]);
  const [contratosNaoLiberam, setContratosNaoLiberam] = useState([]);
  const [valorLiberadoTotal, setValorLiberadoTotal] = useState(0);
  const [contratosExcluidos, setContratosExcluidos] = useState(new Set());
  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [taxaNovo, setTaxaNovo] = useState(() => localStorage.getItem('taxaNovo') || '1.80');
  const [taxaRefin, setTaxaRefin] = useState(() => localStorage.getItem('taxaRefin') || '1.50');
  const [taxaPortabilidade, setTaxaPortabilidade] = useState(() => localStorage.getItem('taxaPortabilidade') || '1.50');
  const [cookieFullConsig, setCookieFullConsig] = useState(() => localStorage.getItem('cookieFullConsig') || '');
  const [tipoConsulta, setTipoConsulta] = useState('cpf');
  const [valorConsulta, setValorConsulta] = useState('');
  const [beneficios, setBeneficios] = useState([]);
  const [beneficioSelecionado, setBeneficioSelecionado] = useState('');
  const [consultando, setConsultando] = useState(false);

  // ── NOVO: estado para portabilidade manual ──
  const [portabilidadesManuais, setPortabilidadesManuais] = useState([
    { banco: '', parcela: '', saldoDevedor: '' }
  ]);

  // Preenche parcela automaticamente com margem livre
  useEffect(() => {
    if (margemDisponivel && margemDisponivel.trim()) {
      setParcela(margemDisponivel.toString());
    }
  }, [margemDisponivel]);

  // Adiciona CSS para esconder botões e coluna 'Incluir' só na captura
  useEffect(() => {
    if (!document.getElementById('print-espelho-style')) {
      const style = document.createElement('style');
      style.id = 'print-espelho-style';
      style.innerHTML = `
        .print-espelho .btn-copiar-simulacao,
        .print-espelho .btn-copiar-imagem,
        .print-espelho th:first-child,
        .print-espelho td:first-child {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Carrega bancos ao iniciar
  useEffect(() => {
    const carregarBancos = async () => {
      try {
        const response = await axios.get(`${API}/bancos`);
        const bancosData = response.data;
        setBancos(bancosData);
        
        const banrisul = bancosData.find(b => b.nome.toLowerCase().includes('banrisul'));
        if (banrisul) {
          setBancoSelecionado(banrisul.codigo);
        } else if (bancosData.length > 0) {
          setBancoSelecionado(bancosData[0].codigo);
        }
      } catch (error) {
        toast.error('Erro ao carregar bancos');
      }
    };
    
    carregarBancos();
  }, []);

  // Calcula valor liberado aproximado baseado na parcela e prazo
  const calcularValorLiberadoAproximado = () => {
    if (!parcela) return 0;
    const taxa = parseFloat(taxaNovo) / 100;
    const n = parseInt(prazo);
    const parcelaNum = parseFloat(parcela);
    const valorLiberado = parcelaNum * ((1 - Math.pow(1 + taxa, -n)) / taxa);
    return valorLiberado;
  };

  // Processa contratos (texto colado)
  const processarContratos = useCallback(async () => {
    try {
      const response = await axios.post(`${API}/parse-contratos`, {
        texto: textoContratos,
        taxa_novo: parseFloat(taxaNovo),
        taxa_refin: parseFloat(taxaRefin),
        taxa_portabilidade: parseFloat(taxaPortabilidade)
      });

      const contratos = response.data;
      
      if (!contratos || contratos.length === 0) {
        return;
      }

      const taxaRefinCalc = parseFloat(taxaRefin) / 100;
      const prazoNovo = 96;

      const contratosProcessados = contratos.map(c => {
        let parcelasRestantes;
        if (c.parcelas_total && c.parcelas_pagas) {
          parcelasRestantes = parseInt(c.parcelas_total) - parseInt(c.parcelas_pagas);
        } else if (c.parcelas_restantes) {
          parcelasRestantes = parseInt(c.parcelas_restantes);
        } else {
          parcelasRestantes = null;
        }

        let saldoDevedor = 0;
        if (c.quitacao) {
          saldoDevedor = parseFloat(String(c.quitacao).replace(/[^\d.,]/g, '').replace(',', '.'));
        } else if (c.saldo_devedor) {
          saldoDevedor = parseFloat(c.saldo_devedor);
        }

        const parcelaAtual = parseFloat(c.valor_parcela) || 0;
        const vpNovo = parcelaAtual * ((1 - Math.pow(1 + taxaRefinCalc, -prazoNovo)) / taxaRefinCalc);
        const valorDisponivel = vpNovo - saldoDevedor;

        return {
          banco: c.banco,
          contrato: c.contrato,
          prazoTotal: c.parcelas_total || '—',
          prazoRestante: parcelasRestantes || '—',
          saldoDevedor: saldoDevedor,
          valorDisponivel: valorDisponivel,
          parcelaAtual: parcelaAtual,
          vpNovo: vpNovo
        };
      });

      const liberam = contratosProcessados.filter(c => 
        c.valorDisponivel > 0 && (c.parcelaAtual > 100 || c.saldoDevedor > 4000)
      );
      const naoLiberam = contratosProcessados.filter(c => 
        c.valorDisponivel <= 0 || (c.parcelaAtual <= 100 && c.saldoDevedor <= 4000)
      );

      // Mantém manuais existentes ao reprocessar texto
      setContratosLiberam(prev => [...liberam, ...prev.filter(c => c.isManual)]);
      setContratosNaoLiberam(prev => [...naoLiberam, ...prev.filter(c => c.isManual)]);

      const totalLiberado = liberam
        .filter((c, idx) => !contratosExcluidos.has(`libera-${idx}`))
        .reduce((sum, c) => sum + c.valorDisponivel, 0);
      setValorLiberadoTotal(totalLiberado);

      toast.success(`${contratos.length} contrato(s) processado(s)`);
    } catch (error) {
      console.error('Erro ao processar contratos:', error);
      toast.error('Erro ao processar contratos');
    }
  }, [textoContratos, taxaNovo, taxaRefin, taxaPortabilidade, contratosExcluidos]);

  useEffect(() => {
    const processarAutomaticamente = async () => {
      if (textoContratos.trim()) {
        await processarContratos();
      }
    };
    processarAutomaticamente();
  }, [textoContratos, bancoSelecionado, bancos, processarContratos]);

  useEffect(() => {
    console.log('contratosLiberam mudou! Novo valor:', contratosLiberam);
    console.log('Length:', contratosLiberam.length);
  }, [contratosLiberam]);

  // ── NOVO: funções para portabilidade manual ──
  const adicionarLinhaManual = () => {
    setPortabilidadesManuais(prev => [...prev, { banco: '', parcela: '', saldoDevedor: '' }]);
  };

  const removerLinhaManual = (idx) => {
    setPortabilidadesManuais(prev => prev.filter((_, i) => i !== idx));
  };

  const atualizarLinhaManual = (idx, campo, valor) => {
    setPortabilidadesManuais(prev =>
      prev.map((linha, i) => i === idx ? { ...linha, [campo]: valor } : linha)
    );
  };

  const calcularPortabilidadesManual = () => {
    const taxaRefinCalc = parseFloat(taxaRefin) / 100;
    const prazoNovo = 96;

    const linhasValidas = portabilidadesManuais.filter(
      l => l.banco.trim() && l.parcela && l.saldoDevedor
    );

    if (linhasValidas.length === 0) {
      toast.error('Preencha ao menos uma linha com Banco, Parcela e Saldo Devedor');
      return;
    }

    const parseMoeda = (v) => {
      // Remove pontos de milhar, troca vírgula decimal por ponto
      // Suporta: "9.867,52" → 9867.52 | "9867,52" → 9867.52 | "9867.52" → 9867.52
      const s = String(v).trim();
      // Se tem vírgula, assume formato pt-BR: remove pontos de milhar, troca vírgula
      if (s.includes(',')) {
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
      }
      // Sem vírgula: pode ser "9867.52" (decimal EN) ou "9867" — parseFloat direto
      return parseFloat(s);
    };

    const novosContratos = linhasValidas.map((l, idx) => {
      const parcelaAtual = parseMoeda(l.parcela);
      const saldoDevedor = parseMoeda(l.saldoDevedor);
      const vpNovo = parcelaAtual * ((1 - Math.pow(1 + taxaRefinCalc, -prazoNovo)) / taxaRefinCalc);
      const valorDisponivel = vpNovo - saldoDevedor;

      return {
        banco: l.banco,
        contrato: `--`,
        prazoTotal: prazoNovo,
        prazoRestante: prazoNovo,
        saldoDevedor,
        valorDisponivel,
        parcelaAtual,
        vpNovo,
        isManual: true
      };
    });

    const liberam = novosContratos.filter(c =>
      c.valorDisponivel > 0 && (c.parcelaAtual > 100 || c.saldoDevedor > 4000)
    );
    const naoLiberam = novosContratos.filter(c =>
      c.valorDisponivel <= 0 || (c.parcelaAtual <= 100 && c.saldoDevedor <= 4000)
    );

    // Substitui manuais antigos, preserva os do texto colado
    setContratosLiberam(prev => [...prev.filter(c => !c.isManual), ...liberam]);
    setContratosNaoLiberam(prev => [...prev.filter(c => !c.isManual), ...naoLiberam]);
    setContratosExcluidos(new Set());

    // Recalcula total com os novos
    setContratosLiberam(prev => {
      const todos = [...prev.filter(c => !c.isManual), ...liberam];
      const total = todos.reduce((sum, c) => sum + c.valorDisponivel, 0);
      setValorLiberadoTotal(total);
      return todos;
    });

    if (liberam.length > 0) {
      toast.success(`${liberam.length} portabilidade(s) manual(is) libera(m) crédito!`);
    } else {
      toast.info('Nenhuma portabilidade manual libera crédito com esses valores.');
    }
  };

  // Recalcula total quando contratosExcluidos muda
  useEffect(() => {
    const total = contratosLiberam
      .filter((_, idx) => !contratosExcluidos.has(`libera-${idx}`))
      .reduce((sum, c) => sum + c.valorDisponivel, 0);
    setValorLiberadoTotal(total);
  }, [contratosExcluidos, contratosLiberam]);

  const copiarSimulacao = () => {
    if (contratosLiberam.length === 0) {
      toast.error('Nenhum contrato disponível para copiar');
      return;
    }

    const bancoDestino = bancos.find(b => b.codigo === bancoSelecionado);
    const nomeBanco = bancoDestino ? bancoDestino.nome : 'Banco Banrisul';

    let texto = `*Portabilidade para o ${nomeBanco} – Renovação em 96 meses!*\n\n`;
    texto += `📅 *Prazo para pagamento: Até 10 dias úteis*\n\n`;

    const contratosIncluidos = contratosLiberam.filter((c, idx) => !contratosExcluidos.has(`libera-${idx}`));

    contratosIncluidos.forEach((contrato, index) => {
      texto += `🔹 ${contrato.banco.toUpperCase()}\n`;
      texto += `▫️ Parcela: R$ ${formatarMoeda(contrato.parcelaAtual)}\n`;
      texto += `▫️ *Valor liberado aproximado: R$ ${formatarMoeda(contrato.valorDisponivel)}*\n`;
      if (index < contratosIncluidos.length - 1) {
        texto += `\n`;
      }
    });

    texto += `\n💵 *Total aproximado disponível: R$ ${formatarMoeda(valorLiberadoTotal)}*`;

    navigator.clipboard.writeText(texto).then(() => {
      toast.success('Simulação copiada para a área de transferência!');
    }).catch(() => {
      toast.error('Erro ao copiar simulação');
    });
  };

  const toggleContratoExcluido = (id) => {
    setContratosExcluidos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const consultarFullConsig = async () => {
    if (!cookieFullConsig) {
      toast.error('Configure o cookie nas Configurações');
      return;
    }
    if (!valorConsulta) {
      toast.error('Preencha o CPF ou Matrícula');
      return;
    }

    setMargemDisponivel('');
    setParcela('');
    setContratosLiberam([]);
    setContratosNaoLiberam([]);
    setValorLiberadoTotal(0);
    setTextoContratos('');
    setContratosExcluidos(new Set());
    setPortabilidadesManuais([{ banco: '', parcela: '', saldoDevedor: '' }]);

    setConsultando(true);
    setBeneficios([]);
    setBeneficioSelecionado('');

    try {
      const response = await axios.post(`${API}/consulta-fullconsig`, {
        cookie: cookieFullConsig,
        tipo: tipoConsulta === 'cpf' ? 'inss' : 'siape',
        valor: valorConsulta
      });

      if (response.data.beneficios.length === 0) {
        toast.error('Nenhum benefício encontrado');
      } else if (response.data.beneficios.length === 1) {
        setBeneficioSelecionado(response.data.beneficios[0].nb);
        await consultarBeneficio(response.data.beneficios[0].nb);
      } else {
        setBeneficios(response.data.beneficios);
        toast.success(`${response.data.beneficios.length} benefícios encontrados`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao consultar');
    } finally {
      setConsultando(false);
    }
  };

  const consultarBeneficio = async (nb) => {
    if (!cookieFullConsig) {
      toast.error('Configure o cookie nas Configurações');
      return;
    }

    setConsultando(true);

    try {
      const response = await axios.post(`${API}/consulta-beneficio`, {
        cookie: cookieFullConsig,
        tipo: 'inss',
        valor: valorConsulta,
        nb: nb || beneficioSelecionado
      });

      setMargemDisponivel(response.data.margem_livre.toString());

      if (response.data.contratos.length > 0) {
        const contratosValidos = response.data.contratos.filter(c => 
          c.parcelas_total > 0 && c.saldo_devedor > 0
        );

        if (contratosValidos.length > 0) {
          processarContratosAPI(contratosValidos);
          toast.success(`${contratosValidos.length} contratos processados!`);
        } else {
          toast.info('Margem carregada, mas nenhum contrato ativo encontrado');
        }
      } else {
        toast.info('Margem carregada, mas nenhum contrato encontrado');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao consultar benefício');
    } finally {
      setConsultando(false);
    }
  };

  const processarContratosAPI = (contratos) => {
    const taxaRefinCalc = parseFloat(taxaRefin) / 100;
    const prazoNovo = 96;

    const contratosProcessados = contratos.map(c => {
      const parcelasRestantes = c.parcelas_total - c.parcelas_pagas;
      const saldoDevedor = c.saldo_devedor;
      const parcelaAtual = c.valor_parcela;
      
      const vpNovo = parcelaAtual * ((1 - Math.pow(1 + taxaRefinCalc, -prazoNovo)) / taxaRefinCalc);
      const valorDisponivel = vpNovo - saldoDevedor;

      return {
        banco: c.banco,
        contrato: c.contrato,
        prazoTotal: c.parcelas_total,
        prazoRestante: parcelasRestantes,
        saldoDevedor: saldoDevedor,
        valorDisponivel: valorDisponivel,
        parcelaAtual: parcelaAtual,
        vpNovo: vpNovo
      };
    });

    const liberam = contratosProcessados.filter(c => 
      c.valorDisponivel > 0 && (c.parcelaAtual > 100 || c.saldoDevedor > 4000)
    );
    const naoLiberam = contratosProcessados.filter(c => 
      c.valorDisponivel <= 0 || (c.parcelaAtual <= 100 && c.saldoDevedor <= 4000)
    );

    setContratosLiberam([...liberam]);
    setContratosNaoLiberam([...naoLiberam]);
    setContratosExcluidos(new Set());

    const totalLiberado = liberam.reduce((sum, c) => sum + c.valorDisponivel, 0);
    setValorLiberadoTotal(totalLiberado);
  };

  const copiarSimulacaoMargem = () => {
    if (!parcela || !prazo) {
      toast.error('Preencha a parcela e o prazo');
      return;
    }

    const valorLiberado = calcularValorLiberadoAproximado();
    const bancoDestino = bancos.find(b => b.codigo === bancoSelecionado);
    const nomeBanco = bancoDestino ? bancoDestino.nome : 'Banco';

    let texto = `*Simulação de Margem Livre*\n\n`;
    texto += `💵 *Parcela:* R$ ${formatarMoeda(parseFloat(parcela))}\n`;
    texto += `📅 *Prazo:* ${prazo} meses\n`;
    texto += `🟢 *Valor Liberado Aproximado: R$ ${formatarMoeda(valorLiberado)}*`;

    navigator.clipboard.writeText(texto).then(() => {
      toast.success('Simulação de margem copiada!');
    }).catch(() => {
      toast.error('Erro ao copiar simulação');
    });
  };

  const copiarImagemEspelho = () => {
    const wrapper = document.getElementById('espelho-oferta');
    if (!wrapper) {
      toast.error('Tabela não encontrada!');
      return;
    }
    wrapper.classList.add('print-espelho');
    html2canvas(wrapper, { backgroundColor: '#fff', scale: 2 }).then(canvas => {
      wrapper.classList.remove('print-espelho');
      canvas.toBlob(blob => {
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([
            new window.ClipboardItem({ 'image/png': blob })
          ]).then(() => {
            toast.success('Imagem copiada!');
          }).catch(() => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'oferta.png';
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Imagem baixada!');
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'oferta.png';
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Imagem baixada!');
        }
      });
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Toaster />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-3">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent" data-testid="main-heading">
              Simulador de Crédito Consignado
            </h1>
            <Button
              onClick={() => setModalConfigAberto(true)}
              variant="outline"
              className="mt-2"
              data-testid="btn-config-taxas"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-gray-600 text-lg" data-testid="subtitle">Portabilidade • Refinanciamento • Margem Consignável</p>
        </div>

        {/* Modal de Configurações de Taxas */}
        {modalConfigAberto && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setModalConfigAberto(false)}>
            <Card className="w-full max-w-md mx-4 bg-white" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações de Taxas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="taxa-novo">Taxa NOVO (Margem) %</Label>
                  <Input
                    id="taxa-novo"
                    type="number"
                    step="0.001"
                    value={taxaNovo}
                    onChange={(e) => {
                      setTaxaNovo(e.target.value);
                      localStorage.setItem('taxaNovo', e.target.value);
                    }}
                    placeholder="Ex: 1.80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxa-refin">Taxa Refinanciamento %</Label>
                  <Input
                    id="taxa-refin"
                    type="number"
                    step="0.001"
                    value={taxaRefin}
                    onChange={(e) => {
                      setTaxaRefin(e.target.value);
                      localStorage.setItem('taxaRefin', e.target.value);
                    }}
                    placeholder="Ex: 1.50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxa-portabilidade">Taxa Portabilidade %</Label>
                  <Input
                    id="taxa-portabilidade"
                    type="number"
                    step="0.001"
                    value={taxaPortabilidade}
                    onChange={(e) => {
                      setTaxaPortabilidade(e.target.value);
                      localStorage.setItem('taxaPortabilidade', e.target.value);
                    }}
                    placeholder="Ex: 1.50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cookie">Cookie FullConsig</Label>
                  <Textarea
                    id="cookie"
                    rows={3}
                    value={cookieFullConsig}
                    onChange={(e) => {
                      setCookieFullConsig(e.target.value);
                      localStorage.setItem('cookieFullConsig', e.target.value);
                    }}
                    placeholder="Cole o cookie completo do FullConsig"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={() => setModalConfigAberto(false)} className="flex-1">
                    Salvar
                  </Button>
                  <Button onClick={() => setModalConfigAberto(false)} variant="outline" className="flex-1">
                    Fechar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="space-y-6">
          {/* Consulta Automática */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg">Consulta Automaticamente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Consulta</Label>
                  <Select value={tipoConsulta} onValueChange={setTipoConsulta}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="matricula">Matrícula</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{tipoConsulta === 'cpf' ? 'CPF' : 'Matrícula'}</Label>
                  <Input
                    placeholder={tipoConsulta === 'cpf' ? '000.000.000-00' : 'Digite a matrícula'}
                    value={valorConsulta}
                    onChange={(e) => setValorConsulta(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  <Button 
                    onClick={consultarFullConsig} 
                    disabled={consultando}
                    className="w-full"
                  >
                    {consultando ? 'Consultando...' : 'Consultar'}
                  </Button>
                </div>
              </div>

              {beneficios.length > 0 && (
                <div className="space-y-2">
                  <Label>Selecione o Benefício</Label>
                  <Select value={beneficioSelecionado} onValueChange={setBeneficioSelecionado}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Escolha um benefício" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {beneficios.map((b) => (
                        <SelectItem key={b.nb} value={b.nb}>
                          {b.nb} - {b.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={() => consultarBeneficio()} 
                    disabled={!beneficioSelecionado || consultando}
                    className="w-full mt-2"
                  >
                    {consultando ? 'Carregando...' : 'Carregar Dados'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nome do Cliente */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg" data-testid="nome-cliente-title">Nome do Cliente (Opcional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                data-testid="input-nome-cliente"
                placeholder="Digite o nome do cliente para aparecer no espelho"
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
                className="text-lg"
              />
            </CardContent>
          </Card>

          {/* Simulação de Margem */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl text-center" data-testid="simulacao-margem-title">
                SIMULAÇÃO DE MARGEM
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="margem-livre" data-testid="label-margem-livre">Margem Livre (R$)</Label>
                  <Input
                    id="margem-livre"
                    data-testid="input-margem-livre"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 37,00"
                    value={margemDisponivel}
                    onChange={(e) => setMargemDisponivel(e.target.value)}
                    className="text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="parcela" data-testid="label-parcela">Parcela (R$)</Label>
                  <Input
                    id="parcela"
                    data-testid="input-parcela"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 35,38"
                    value={parcela}
                    onChange={(e) => setParcela(e.target.value)}
                    className="text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prazo" data-testid="label-prazo">Prazo</Label>
                  <Select value={prazo} onValueChange={setPrazo}>
                    <SelectTrigger data-testid="select-prazo" className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="96" data-testid="option-prazo-96">96 meses</SelectItem>
                      <SelectItem value="84" data-testid="option-prazo-84">84 meses</SelectItem>
                      <SelectItem value="72" data-testid="option-prazo-72">72 meses</SelectItem>
                      <SelectItem value="60" data-testid="option-prazo-60">60 meses</SelectItem>
                      <SelectItem value="48" data-testid="option-prazo-48">48 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="banco-destino" data-testid="label-banco-destino">Banco Destino</Label>
                  <Select value={bancoSelecionado} onValueChange={setBancoSelecionado}>
                    <SelectTrigger data-testid="select-banco-destino" className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {bancos.map(b => (
                        <SelectItem key={b.codigo} value={b.codigo} data-testid={`option-banco-${b.codigo}`}>
                          {b.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {parcela && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border-2 border-green-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-8 h-8 text-green-600" />
                      <span className="text-lg font-medium text-gray-700">Valor Liberado Aproximado:</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-3xl font-bold text-green-700" data-testid="valor-liberado-aproximado">
                        R$ {formatarMoeda(calcularValorLiberadoAproximado())}
                      </span>
                      <Button
                        onClick={copiarSimulacaoMargem}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid="btn-copiar-margem"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Simulação
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contratos que LIBERAM crédito */}
          {contratosLiberam.length > 0 && (
            <Card className="shadow-xl border-green-400">
              <div id="espelho-oferta">
              <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl flex items-center gap-2" data-testid="contratos-liberam-title">
                    <TrendingUp className="w-6 h-6" />
                    Contratos que LIBERAM crédito
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold" data-testid="valor-total-liberado">
                      Total: R$ {formatarMoeda(valorLiberadoTotal)}
                    </span>
                    <Button 
                      onClick={copiarSimulacao}
                      className="bg-white text-green-700 hover:bg-green-50 font-semibold btn-copiar-simulacao"
                      data-testid="btn-copiar-simulacao"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar Simulação
                    </Button>
                    <Button
                      onClick={copiarImagemEspelho}
                      className="bg-white text-green-700 hover:bg-green-50 font-semibold btn-copiar-imagem"
                      data-testid="btn-copiar-imagem"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg>
                      Copiar Imagem
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="tabela-contratos-liberam">
                    <thead>
                      <tr className="border-b-2 border-green-300">
                        <th className="text-center py-3 px-2 font-semibold">Incluir</th>
                        <th className="text-left py-3 px-2 font-semibold">Banco</th>
                        <th className="text-left py-3 px-2 font-semibold">Nº Contrato</th>
                        <th className="text-right py-3 px-2 font-semibold">Parcela</th>
                        <th className="text-center py-3 px-2 font-semibold">Prazo Restante</th>
                        <th className="text-right py-3 px-2 font-semibold">Saldo Devedor</th>
                        <th className="text-right py-3 px-2 font-semibold">Valor Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratosLiberam.map((c, idx) => {
                        const contratoId = `libera-${idx}`;
                        const isExcluido = contratosExcluidos.has(contratoId);
                        return (
                        <tr key={idx} className={`border-b hover:bg-green-50 ${isExcluido ? 'opacity-50' : ''} ${c.isManual ? 'bg-blue-50' : ''}`} data-testid={`contrato-libera-${idx}`}>
                          <td className="py-3 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={!isExcluido}
                              onChange={() => toggleContratoExcluido(contratoId)}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-2" data-testid={`contrato-libera-banco-${idx}`}>
                            {c.banco}
                          </td>
                          <td className="py-3 px-2 font-mono text-xs" data-testid={`contrato-libera-numero-${idx}`}>{c.contrato}</td>
                          <td className="py-3 px-2 text-right text-purple-700 font-bold" data-testid={`contrato-libera-parcela-${idx}`}>
                            R$ {formatarMoeda(c.parcelaAtual)}
                          </td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-libera-prazo-restante-${idx}`}>{c.prazoRestante}</td>
                          <td className="py-3 px-2 text-right text-blue-700 font-semibold" data-testid={`contrato-libera-saldo-${idx}`}>
                            R$ {formatarMoeda(c.saldoDevedor)}
                          </td>
                          <td className="py-3 px-2 text-right text-green-700 font-bold" data-testid={`contrato-libera-valor-${idx}`}>
                            R$ {formatarMoeda(c.valorDisponivel)}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
              </div>
            </Card>
          )}

          {/* Contratos que NÃO LIBERAM crédito */}
          {contratosNaoLiberam.length > 0 && (
            <Card className="shadow-xl border-red-400">
              <CardHeader className="bg-gradient-to-r from-red-600 to-rose-600 text-white">
                <CardTitle className="text-xl flex items-center gap-2" data-testid="contratos-nao-liberam-title">
                  <TrendingDown className="w-6 h-6" />
                  Contratos que NÃO LIBERAM crédito
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="tabela-contratos-nao-liberam">
                    <thead>
                      <tr className="border-b-2 border-red-300">
                        <th className="text-left py-3 px-2 font-semibold">Banco</th>
                        <th className="text-left py-3 px-2 font-semibold">Nº Contrato</th>
                        <th className="text-right py-3 px-2 font-semibold">Parcela</th>
                        <th className="text-center py-3 px-2 font-semibold">Prazo Restante</th>
                        <th className="text-right py-3 px-2 font-semibold">Saldo Devedor</th>
                        <th className="text-left py-3 px-2 font-semibold">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratosNaoLiberam.map((c, idx) => (
                        <tr key={idx} className="border-b hover:bg-red-50" data-testid={`contrato-nao-libera-${idx}`}>
                          <td className="py-3 px-2" data-testid={`contrato-nao-libera-banco-${idx}`}>
                            {c.banco}
                          </td>
                          <td className="py-3 px-2 font-mono text-xs" data-testid={`contrato-nao-libera-numero-${idx}`}>{c.contrato}</td>
                          <td className="py-3 px-2 text-right text-purple-700 font-bold" data-testid={`contrato-nao-libera-parcela-${idx}`}>
                            R$ {formatarMoeda(c.parcelaAtual)}
                          </td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-nao-libera-prazo-restante-${idx}`}>{c.prazoRestante}</td>
                          <td className="py-3 px-2 text-right text-blue-700 font-semibold" data-testid={`contrato-nao-libera-saldo-${idx}`}>
                            R$ {formatarMoeda(c.saldoDevedor)}
                          </td>
                          <td className="py-3 px-2 text-red-700 text-sm" data-testid={`contrato-nao-libera-motivo-${idx}`}>
                            {c.valorDisponivel <= 0 
                              ? 'Não libera (Valor Negativo)'
                              : 'Parcela abaixo do minimo'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cole seus Contratos */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2" data-testid="contratos-title">
                <Calculator className="w-5 h-5" />
                Cole seus Contratos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                data-testid="textarea-contratos"
                placeholder="Cole aqui os contratos existentes...

Exemplo:
329 - QI SOCIEDADE DE CREDITO DIRETO S A
QUA0001117593
24/10/2025
11/2025
10/2033
R$ 994,17
1,50%
R$ 215,49
0/96 - 96 Restantes
11.141,19"
                className="min-h-[300px] font-mono text-sm"
                value={textoContratos}
                onChange={(e) => setTextoContratos(e.target.value)}
              />
              <p className="text-sm text-gray-500 mt-2">
                * Os contratos serão processados automaticamente ao colar
              </p>
            </CardContent>
          </Card>

          {/* ── NOVO: Simular Portabilidade Manual ── */}
          <Card className="shadow-xl border-blue-300">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Simular Portabilidade
                <span className="text-sm font-normal text-blue-500 ml-1">(entrada manual)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              {/* Cabeçalho das colunas */}
              <div className="grid grid-cols-12 gap-2 px-1">
                <div className="col-span-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Banco</div>
                <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Parcela (R$)</div>
                <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo Devedor (R$)</div>
                <div className="col-span-1"></div>
              </div>

              {/* Linhas de entrada */}
              {portabilidadesManuais.map((linha, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input
                      placeholder="Ex: Banco PAN"
                      value={linha.banco}
                      onChange={e => atualizarLinhaManual(idx, 'banco', e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="249,76"
                      value={linha.parcela}
                      onChange={e => atualizarLinhaManual(idx, 'parcela', e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="9.867,52"
                      value={linha.saldoDevedor}
                      onChange={e => atualizarLinhaManual(idx, 'saldoDevedor', e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {portabilidadesManuais.length > 1 && (
                      <button
                        onClick={() => removerLinhaManual(idx)}
                        className="text-red-400 hover:text-red-600 text-xl font-bold leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-red-50"
                        title="Remover linha"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Botões */}
              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={adicionarLinhaManual}
                  className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  + Adicionar Contrato
                </Button>
                <Button
                  onClick={calcularPortabilidadesManual}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  Calcular Portabilidade
                </Button>
              </div>

              <p className="text-xs text-gray-400 pt-1">
                * Prazo fixo de 96 meses · Taxa de Refinanciamento: <strong>{taxaRefin}% a.m.</strong> · Os resultados são adicionados à lista acima
              </p>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

export default App;